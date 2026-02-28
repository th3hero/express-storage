import type { S3Client as S3ClientType } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo, DeleteResult } from '../types/storage.types.js';
import { encodePathSegments } from '../utils/file.utils.js';

// Lazy SDK loaders — modules are imported on first use, not at import time.
// Consumers only need to install the SDKs for the drivers they actually use.

let _s3Mod: Promise<typeof import('@aws-sdk/client-s3')> | undefined;
function loadS3SDK(): Promise<typeof import('@aws-sdk/client-s3')> {
  if (!_s3Mod) {
    _s3Mod = import('@aws-sdk/client-s3').catch(() => {
      _s3Mod = undefined;
      throw new Error(
        '@aws-sdk/client-s3 is required for S3 storage.\n' +
        'Install: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner'
      );
    });
  }
  return _s3Mod;
}

let _s3UploadMod: Promise<typeof import('@aws-sdk/lib-storage')> | undefined;
function loadS3Upload(): Promise<typeof import('@aws-sdk/lib-storage')> {
  if (!_s3UploadMod) {
    _s3UploadMod = import('@aws-sdk/lib-storage').catch(() => {
      _s3UploadMod = undefined;
      throw new Error(
        '@aws-sdk/lib-storage is required for streaming uploads to S3.\n' +
        'Install: npm install @aws-sdk/lib-storage'
      );
    });
  }
  return _s3UploadMod;
}

let _s3PresignerMod: Promise<typeof import('@aws-sdk/s3-request-presigner')> | undefined;
function loadS3Presigner(): Promise<typeof import('@aws-sdk/s3-request-presigner')> {
  if (!_s3PresignerMod) {
    _s3PresignerMod = import('@aws-sdk/s3-request-presigner').catch(() => {
      _s3PresignerMod = undefined;
      throw new Error(
        '@aws-sdk/s3-request-presigner is required for presigned URLs.\n' +
        'Install: npm install @aws-sdk/s3-request-presigner'
      );
    });
  }
  return _s3PresignerMod;
}

/**
 * S3StorageDriver - Handles file operations with Amazon S3.
 * 
 * Supports two authentication methods:
 * 1. Explicit credentials (AWS_ACCESS_KEY + AWS_SECRET_KEY)
 * 2. IAM roles (when running on AWS infrastructure)
 * 
 * If you don't provide credentials, the AWS SDK automatically uses
 * IAM roles, environment variables, or the shared credentials file.
 * 
 * When driver is 's3-presigned', upload() returns presigned URLs
 * instead of uploading directly.
 * 
 * Required packages: @aws-sdk/client-s3, @aws-sdk/lib-storage, @aws-sdk/s3-request-presigner
 */
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

  /**
   * Uploads a file to S3, or returns a presigned URL when in presigned mode.
   * 
   * For large files (>100MB), uses streaming multipart upload to reduce
   * memory usage and improve reliability.
   */
  async upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult> {
    if (this.presignedMode) {
      return this.presignedUpload(file);
    }
    
    try {
      const { errors: validationErrors, resolvedSize } = await this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '), 'VALIDATION_FAILED');
      }

      const fileName = this.generateFileName(file.originalname);
      const fileKey = this.buildFilePath(fileName);
      
      if (this.shouldUseStreaming(resolvedSize)) {
        return await this.uploadWithStream(file, fileKey, resolvedSize, options);
      }
      
      const s3 = await loadS3SDK();
      const client = await this.ensureClient();
      const fileContent = await this.getFileContent(file);
      
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
        Key: fileKey,
        Body: fileContent,
        ContentType: options?.contentType || file.mimetype,
        ContentLength: fileContent.length,
      };

      if (options?.cacheControl) {
        commandInput.CacheControl = options.cacheControl;
      }
      if (options?.contentDisposition) {
        commandInput.ContentDisposition = options.contentDisposition;
      }
      if (options?.metadata) {
        commandInput.Metadata = options.metadata;
      }

      const uploadCommand = new s3.PutObjectCommand(commandInput);
      await client.send(uploadCommand, options?.signal ? { abortSignal: options.signal } : undefined);
      
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${encodePathSegments(fileKey)}`;
      
      return this.createSuccessResult(fileKey, fileUrl);
    } catch (error) {
      await this.cleanupTempFile(file);
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file to S3'
      );
    }
  }

  /**
   * Uploads a large file using streaming multipart upload.
   * Uses @aws-sdk/lib-storage which handles chunking and concurrency automatically.
   */
  private async uploadWithStream(
    file: Express.Multer.File,
    fileKey: string,
    fileSize: number,
    options?: UploadOptions
  ): Promise<FileUploadResult> {
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
    
    const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${encodePathSegments(fileKey)}`;
    
    return this.createSuccessResult(fileKey, fileUrl);
  }

  /**
   * Creates a presigned URL for uploading directly to S3.
   * 
   * The URL enforces:
   * - Exact content type (baked into the signature)
   * - Exact file size (if provided)
   * 
   * Clients that try to upload different content will get a 403.
   */
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

  /**
   * Creates a presigned URL for downloading/viewing a file.
   */
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

  /**
   * Deletes a file from S3.
   */
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

  /**
   * Confirms an upload and optionally validates the file.
   * Uses shared validation logic from BaseStorageDriver.
   */
  override async validateAndConfirmUpload(
    reference: string,
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    try {
      const s3 = await loadS3SDK();
      const client = await this.ensureClient();

      const headResult = await client.send(new s3.HeadObjectCommand({
        Bucket: this.bucketName,
        Key: reference,
      }));

      const actual = {
        contentType: headResult.ContentType,
        fileSize: headResult.ContentLength,
      };

      const validationError = await this.checkUploadedFileMetadata(reference, actual, options);
      if (validationError) return validationError;

      const viewResult = await this.generateViewUrl(reference);
      return this.buildValidationSuccess(reference, viewResult.success ? viewResult.viewUrl : undefined, actual.contentType, actual.fileSize);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'File not found or access denied',
        code: 'FILE_NOT_FOUND',
      };
    }
  }

  /**
   * Returns metadata about a file from S3 without downloading it.
   */
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

  /**
   * Lists files in the bucket with optional prefix filtering and pagination.
   */
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
