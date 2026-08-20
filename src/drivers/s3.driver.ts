import type { S3Client as S3ClientType } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo, DeleteResult, StorageFile } from '../types/storage.types.js';
import { encodePathSegments } from '../utils/file.utils.js';
import { createLazyImport } from '../utils/lazy-import.js';

const loadS3SDK = createLazyImport(
  () => import('@aws-sdk/client-s3'),
  '@aws-sdk/client-s3 is required for S3 storage.\nInstall: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner'
);

const loadS3Upload = createLazyImport(
  () => import('@aws-sdk/lib-storage'),
  '@aws-sdk/lib-storage is required for streaming uploads to S3.\nInstall: npm install @aws-sdk/lib-storage'
);

const loadS3Presigner = createLazyImport(
  () => import('@aws-sdk/s3-request-presigner'),
  '@aws-sdk/s3-request-presigner is required for presigned URLs.\nInstall: npm install @aws-sdk/s3-request-presigner'
);

export class S3StorageDriver extends BaseStorageDriver {
  private _client?: S3ClientType | undefined;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(config: StorageConfig) {
    super(config);
    
    if (!config.bucketName) {
      throw new Error('bucketName is required for S3. Set BUCKET_NAME environment variable or pass bucketName in credentials.');
    }
    if (!config.awsRegion) {
      throw new Error('awsRegion is required for S3. Set AWS_REGION environment variable or pass awsRegion in credentials.');
    }
    
    this.bucketName = config.bucketName;
    this.region = config.awsRegion;
  }

  private async ensureClient(): Promise<S3ClientType> {
    if (this._client) return this._client;

    const { S3Client } = await loadS3SDK();
    const s3Options: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
      region: this.region,
    };

    if (this.config.awsAccessKey && this.config.awsSecretKey) {
      s3Options.credentials = {
        accessKeyId: this.config.awsAccessKey,
        secretAccessKey: this.config.awsSecretKey,
      };
    }

    this._client = new S3Client(s3Options);
    return this._client;
  }

  override destroy(): void {
    this._client?.destroy();
    this._client = undefined;
  }

  async upload(file: StorageFile, options?: UploadOptions): Promise<FileUploadResult> {
    if (this.presignedMode) {
      return this.presignedUpload(file);
    }

    return this.executeDirectUpload(file, options, 'S3', async ({ file: uploadFile, key, resolvedSize, options: uploadOptions }) => {
      if (this.shouldUseStreaming(resolvedSize)) {
        return this.uploadWithStream(uploadFile, key, resolvedSize, uploadOptions);
      }

      const s3 = await loadS3SDK();
      const client = await this.ensureClient();
      const fileContent = await this.getFileContent(uploadFile);

      const commandInput: {
        Bucket: string;
        Key: string;
        Body: Buffer;
        ContentType: string;
        ContentLength: number;
        CacheControl?: string;
        ContentDisposition?: string;
        Metadata?: Record<string, string>;
      } = {
        Bucket: this.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: uploadOptions?.contentType || uploadFile.mimetype,
        ContentLength: fileContent.length,
      };

      if (uploadOptions?.cacheControl) {
        commandInput.CacheControl = uploadOptions.cacheControl;
      }
      if (uploadOptions?.contentDisposition) {
        commandInput.ContentDisposition = uploadOptions.contentDisposition;
      }
      if (uploadOptions?.metadata) {
        commandInput.Metadata = uploadOptions.metadata;
      }

      const uploadCommand = new s3.PutObjectCommand(commandInput);
      await client.send(uploadCommand, uploadOptions?.signal ? { abortSignal: uploadOptions.signal } : undefined);

      return this.publicUrl(key);
    });
  }

  private publicUrl(key: string): string {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${encodePathSegments(key)}`;
  }

  private async uploadWithStream(
    file: StorageFile,
    fileKey: string,
    fileSize: number,
    options?: UploadOptions
  ): Promise<string> {
    const s3Upload = await loadS3Upload();
    const client = await this.ensureClient();
    const fileStream = this.getFileStream(file);
    
    const uploadParams: {
      Bucket: string;
      Key: string;
      Body: Readable;
      ContentType: string;
      ContentLength?: number;
      CacheControl?: string;
      ContentDisposition?: string;
      Metadata?: Record<string, string>;
    } = {
      Bucket: this.bucketName,
      Key: fileKey,
      Body: fileStream,
      ContentType: options?.contentType || file.mimetype,
    };

    if (fileSize > 0) {
      uploadParams.ContentLength = fileSize;
    }
    if (options?.cacheControl) {
      uploadParams.CacheControl = options.cacheControl;
    }
    if (options?.contentDisposition) {
      uploadParams.ContentDisposition = options.contentDisposition;
    }
    if (options?.metadata) {
      uploadParams.Metadata = options.metadata;
    }

    const upload = new s3Upload.Upload({
      client,
      params: uploadParams,
      partSize: 10 * 1024 * 1024,
      queueSize: 4,
    });

    if (options?.signal) {
      options.signal.addEventListener('abort', () => { void upload.abort(); }, { once: true });
    }

    await upload.done();
    return this.publicUrl(fileKey);
  }

  async generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult> {
    try {
      const decodedFileName = this.decodeFileName(fileName);
      const s3 = await loadS3SDK();
      const presigner = await loadS3Presigner();
      const client = await this.ensureClient();
      const resolvedContentType = contentType || 'application/octet-stream';
      
      const commandInput: {
        Bucket: string;
        Key: string;
        ContentType: string;
        ContentLength?: number;
      } = {
        Bucket: this.bucketName,
        Key: decodedFileName,
        ContentType: resolvedContentType,
      };

      if (fileSize !== undefined) {
        commandInput.ContentLength = fileSize;
      }

      const uploadCommand = new s3.PutObjectCommand(commandInput);

      const uploadUrl = await presigner.getSignedUrl(client, uploadCommand, {
        expiresIn: this.getPresignedUrlExpiry(),
        signableHeaders: new Set(['content-type', 'content-length']),
      });

      return this.createPresignedSuccessResult(uploadUrl);
    } catch (error) {
      return this.createPresignedErrorResult(
        error instanceof Error ? error.message : 'Failed to generate upload URL'
      );
    }
  }

  async generateViewUrl(fileName: string): Promise<PresignedUrlResult> {
    try {
      const decodedFileName = this.decodeFileName(fileName);
      const s3 = await loadS3SDK();
      const presigner = await loadS3Presigner();
      const client = await this.ensureClient();

      const getCommand = new s3.GetObjectCommand({
        Bucket: this.bucketName,
        Key: decodedFileName,
      });

      const viewUrl = await presigner.getSignedUrl(client, getCommand, {
        expiresIn: this.getPresignedUrlExpiry(),
      });

      return this.createPresignedSuccessResult(undefined, viewUrl);
    } catch (error) {
      return this.createPresignedErrorResult(
        error instanceof Error ? error.message : 'Failed to generate view URL'
      );
    }
  }

  async delete(fileName: string): Promise<DeleteResult> {
    try {
      const decodedFileName = this.decodeFileName(fileName);
      const s3 = await loadS3SDK();
      const client = await this.ensureClient();

      const headCommand = new s3.HeadObjectCommand({
        Bucket: this.bucketName,
        Key: decodedFileName,
      });
      
      try {
        await client.send(headCommand);
      } catch (error) {
        const errorName = (error as { name?: string })?.name;
        const httpStatusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
        
        if (httpStatusCode === 404 || errorName === 'NotFound' || errorName === 'NoSuchKey') {
          return { success: false, reference: fileName, error: 'File not found', code: 'FILE_NOT_FOUND' };
        }
        throw error;
      }
      
      const deleteCommand = new s3.DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: decodedFileName,
      });

      await client.send(deleteCommand);
      return { success: true, reference: fileName };
    } catch (error) {
      return { success: false, reference: fileName, error: error instanceof Error ? error.message : 'Failed to delete file', code: 'PROVIDER_ERROR' };
    }
  }

  
  override async validateAndConfirmUpload(
    reference: string,
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    return this.confirmUploadFromMetadata(reference, options, async () => {
      const s3 = await loadS3SDK();
      const client = await this.ensureClient();
      const headResult = await client.send(new s3.HeadObjectCommand({
        Bucket: this.bucketName,
        Key: reference,
      }));
      return {
        contentType: headResult.ContentType,
        fileSize: headResult.ContentLength,
      };
    });
  }

  async getMetadata(reference: string): Promise<FileInfo | null> {
    try {
      const decoded = this.decodeFileName(reference);
      const s3 = await loadS3SDK();
      const client = await this.ensureClient();
      const result = await client.send(new s3.HeadObjectCommand({
        Bucket: this.bucketName,
        Key: decoded,
      }));

      const info: FileInfo = { name: reference };
      if (result.ContentLength !== undefined) info.size = result.ContentLength;
      if (result.ContentType) info.contentType = result.ContentType;
      if (result.LastModified) info.lastModified = result.LastModified;
      return info;
    } catch {
      return null;
    }
  }

  async listFiles(
    prefix?: string,
    maxResults: number = 1000,
    continuationToken?: string
  ): Promise<ListFilesResult> {
    try {
      const validatedMaxResults = this.validateMaxResults(maxResults);

      const s3 = await loadS3SDK();
      const client = await this.ensureClient();
      
      const command = new s3.ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix || undefined,
        MaxKeys: validatedMaxResults,
        ContinuationToken: continuationToken || undefined,
      });

      const response = await client.send(command);

      const files: FileInfo[] = (response.Contents || []).map(item => {
        const fileInfo: FileInfo = { name: item.Key || '' };
        if (item.Size !== undefined) fileInfo.size = item.Size;
        if (item.LastModified) fileInfo.lastModified = item.LastModified;
        return fileInfo;
      });

      const result: ListFilesResult = {
        success: true,
        files,
      };

      if (response.NextContinuationToken) {
        result.nextToken = response.NextContinuationToken;
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
        code: 'PROVIDER_ERROR',
      };
    }
  }
}
