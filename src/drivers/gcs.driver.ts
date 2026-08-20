import type { Storage as StorageType, Bucket as BucketType, File as FileType } from '@google-cloud/storage';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo, DeleteResult, StorageFile } from '../types/storage.types.js';
import { encodePathSegments } from '../utils/file.utils.js';
import { isNotFoundError } from '../utils/errors.js';
import { createLazyImport } from '../utils/lazy-import.js';

function parseGcsFileSize(size: unknown): number | undefined {
  if (size === undefined || size === null) return undefined;
  const parsed = typeof size === 'string' ? parseInt(size, 10) : Number(size);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const loadGCSSDK = createLazyImport(
  () => import('@google-cloud/storage'),
  '@google-cloud/storage is required for GCS storage.\nInstall: npm install @google-cloud/storage'
);

export class GCSStorageDriver extends BaseStorageDriver {
  private _storage?: StorageType | undefined;
  private _bucket?: BucketType | undefined;
  private readonly bucketName: string;
  private readonly projectId: string;

  constructor(config: StorageConfig) {
    super(config);
    
    if (!config.bucketName) {
      throw new Error('bucketName is required for GCS. Set BUCKET_NAME environment variable or pass bucketName in credentials.');
    }
    if (!config.gcsProjectId) {
      throw new Error('gcsProjectId is required for GCS. Set GCS_PROJECT_ID environment variable or pass gcsProjectId in credentials.');
    }
    
    this.bucketName = config.bucketName;
    this.projectId = config.gcsProjectId;
  }

  private async ensureBucket(): Promise<BucketType> {
    if (this._bucket) return this._bucket;

    const { Storage } = await loadGCSSDK();
    const storageOptions: { projectId: string; keyFilename?: string } = {
      projectId: this.projectId,
    };
    
    if (this.config.gcsCredentials) {
      storageOptions.keyFilename = this.config.gcsCredentials;
    }
    
    this._storage = new Storage(storageOptions);
    this._bucket = this._storage.bucket(this.bucketName);
    return this._bucket;
  }

  override destroy(): void {
    this._storage = undefined;
    this._bucket = undefined;
  }

  async upload(file: StorageFile, options?: UploadOptions): Promise<FileUploadResult> {
    if (this.presignedMode) {
      return this.presignedUpload(file);
    }

    return this.executeDirectUpload(file, options, 'GCS', async ({ file: uploadFile, key, resolvedSize, options: uploadOptions }) => {
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(key);

      const metadata: {
        contentType: string;
        cacheControl?: string;
        contentDisposition?: string;
        metadata?: Record<string, string>;
      } = {
        contentType: uploadOptions?.contentType || uploadFile.mimetype,
      };

      if (uploadOptions?.cacheControl) {
        metadata.cacheControl = uploadOptions.cacheControl;
      }
      if (uploadOptions?.contentDisposition) {
        metadata.contentDisposition = uploadOptions.contentDisposition;
      }
      if (uploadOptions?.metadata) {
        metadata.metadata = uploadOptions.metadata;
      }

      uploadOptions?.signal?.throwIfAborted();

      if (this.shouldUseStreaming(resolvedSize)) {
        await this.uploadWithStream(gcsFile, uploadFile, metadata, uploadOptions?.signal);
      } else {
        const fileContent = await this.getFileContent(uploadFile);
        await gcsFile.save(fileContent, { metadata });
      }

      return `https://storage.googleapis.com/${this.bucketName}/${encodePathSegments(key)}`;
    });
  }

  private async uploadWithStream(
    gcsFile: FileType,
    file: StorageFile,
    metadata: { contentType: string; cacheControl?: string; contentDisposition?: string; metadata?: Record<string, string> },
    signal?: AbortSignal
  ): Promise<void> {
    const fileStream = this.getFileStream(file);
    const writeStream = gcsFile.createWriteStream({
      metadata,
      resumable: true,
    });
    await this.pipeWithAbort(fileStream, writeStream, signal);
  }

  async generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult> {
    try {
      const decodedFileName = this.decodeFileName(fileName);
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(decodedFileName);
      const resolvedContentType = contentType || 'application/octet-stream';
      const expiresOn = new Date(Date.now() + (this.getPresignedUrlExpiry() * 1000));
      
      const options: {
        version: 'v4';
        action: 'write';
        expires: Date;
        contentType: string;
        extensionHeaders?: Record<string, string>;
      } = {
        version: 'v4',
        action: 'write',
        expires: expiresOn,
        contentType: resolvedContentType,
      };

      if (fileSize !== undefined) {
        options.extensionHeaders = {
          'x-goog-content-length-range': `${fileSize},${fileSize}`,
        };
      }
      
      const [uploadUrl] = await gcsFile.getSignedUrl(options);

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
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(decodedFileName);
      const expiresOn = new Date(Date.now() + (this.getPresignedUrlExpiry() * 1000));
      
      const [viewUrl] = await gcsFile.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: expiresOn,
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
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(decodedFileName);
      await gcsFile.delete();
      return { success: true, reference: fileName };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { success: false, reference: fileName, error: 'File not found', code: 'FILE_NOT_FOUND' };
      }
      return { success: false, reference: fileName, error: error instanceof Error ? error.message : 'Failed to delete file', code: 'PROVIDER_ERROR' };
    }
  }

  
  override async validateAndConfirmUpload(
    reference: string,
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    return this.confirmUploadFromMetadata(reference, options, async () => {
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(reference);
      const [metadata] = await gcsFile.getMetadata();
      return {
        contentType: metadata.contentType,
        fileSize: parseGcsFileSize(metadata.size),
      };
    });
  }

  async getMetadata(reference: string): Promise<FileInfo | null> {
    try {
      const decoded = this.decodeFileName(reference);
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(decoded);
      const [metadata] = await gcsFile.getMetadata();
      const info: FileInfo = { name: reference };
      const size = parseGcsFileSize(metadata.size);
      if (size !== undefined) info.size = size;
      if (metadata.contentType) info.contentType = metadata.contentType;
      if (metadata.updated) info.lastModified = new Date(metadata.updated);
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
      
      const bucket = await this.ensureBucket();
      const options: { prefix?: string; maxResults: number; pageToken?: string } = {
        maxResults: validatedMaxResults,
      };
      if (prefix) options.prefix = prefix;
      if (continuationToken) options.pageToken = continuationToken;

      const [files, , apiResponse] = await bucket.getFiles(options);

      const fileList: FileInfo[] = files.map((file: FileType) => {
        const fileInfo: FileInfo = { name: file.name };
        const size = parseGcsFileSize(file.metadata.size);
        if (size !== undefined) fileInfo.size = size;
        if (file.metadata.contentType) {
          fileInfo.contentType = file.metadata.contentType;
        }
        if (file.metadata.updated) {
          fileInfo.lastModified = new Date(file.metadata.updated);
        }
        return fileInfo;
      });

      const result: ListFilesResult = {
        success: true,
        files: fileList,
      };

      const responseWithToken = apiResponse as { nextPageToken?: string } | undefined;
      if (responseWithToken?.nextPageToken) {
        result.nextToken = responseWithToken.nextPageToken;
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
