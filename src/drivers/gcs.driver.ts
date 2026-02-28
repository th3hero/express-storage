import type { Storage as StorageType, Bucket as BucketType, File as FileType } from '@google-cloud/storage';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo, DeleteResult } from '../types/storage.types.js';
import { encodePathSegments } from '../utils/file.utils.js';

function parseGcsFileSize(size: unknown): number | undefined {
  if (size === undefined || size === null) return undefined;
  const parsed = typeof size === 'string' ? parseInt(size, 10) : Number(size);
  return Number.isNaN(parsed) ? undefined : parsed;
}

// Lazy SDK loader — module is imported on first use, not at import time.
let _gcsMod: Promise<typeof import('@google-cloud/storage')> | undefined;
function loadGCSSDK(): Promise<typeof import('@google-cloud/storage')> {
  if (!_gcsMod) {
    _gcsMod = import('@google-cloud/storage').catch(() => {
      _gcsMod = undefined;
      throw new Error(
        '@google-cloud/storage is required for GCS storage.\n' +
        'Install: npm install @google-cloud/storage'
      );
    });
  }
  return _gcsMod;
}

/**
 * GCSStorageDriver - Handles file operations with Google Cloud Storage.
 * 
 * Supports two authentication methods:
 * 1. Service account JSON file (GCS_CREDENTIALS path)
 * 2. Application Default Credentials (when running on GCP)
 * 
 * If you're running on GCP (Cloud Run, GKE, etc.), you usually don't need
 * to provide credentials — the SDK picks them up automatically.
 * 
 * When driver is 'gcs-presigned', upload() returns presigned URLs
 * instead of uploading directly.
 * 
 * Required package: @google-cloud/storage
 */
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

  /**
   * Uploads a file to GCS, or returns a presigned URL when in presigned mode.
   * 
   * For large files (>100MB), uses streaming upload to reduce
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
      const filePath = this.buildFilePath(fileName);
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(filePath);
      
      const metadata: {
        contentType: string;
        cacheControl?: string;
        contentDisposition?: string;
        metadata?: Record<string, string>;
      } = {
        contentType: options?.contentType || file.mimetype,
      };

      if (options?.cacheControl) {
        metadata.cacheControl = options.cacheControl;
      }
      if (options?.contentDisposition) {
        metadata.contentDisposition = options.contentDisposition;
      }
      if (options?.metadata) {
        metadata.metadata = options.metadata;
      }

      options?.signal?.throwIfAborted();

      if (this.shouldUseStreaming(resolvedSize)) {
        await this.uploadWithStream(gcsFile, file, metadata);
      } else {
        const fileContent = await this.getFileContent(file);
        await gcsFile.save(fileContent, { metadata });
      }
      
      const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${encodePathSegments(filePath)}`;
      
      return this.createSuccessResult(filePath, fileUrl);
    } catch (error) {
      await this.cleanupTempFile(file);
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file to GCS'
      );
    }
  }

  /**
   * Uploads a large file using streaming.
   * Pipes the file stream directly to GCS for memory efficiency.
   */
  private async uploadWithStream(
    gcsFile: FileType,
    file: Express.Multer.File,
    metadata: { contentType: string; cacheControl?: string; contentDisposition?: string; metadata?: Record<string, string> }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = this.getFileStream(file);
      const writeStream = gcsFile.createWriteStream({
        metadata,
        resumable: true,
      });

      fileStream.on('error', reject);

      fileStream
        .pipe(writeStream)
        .on('error', reject)
        .on('finish', resolve);
    });
  }

  /**
   * Creates a presigned URL for uploading directly to GCS.
   * 
   * The URL enforces:
   * - Exact content type
   * - Exact file size (via x-goog-content-length-range header)
   */
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

  /**
   * Creates a presigned URL for downloading/viewing a file.
   */
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

  /**
   * Deletes a file from GCS.
   */
  async delete(fileName: string): Promise<DeleteResult> {
    try {
      const decodedFileName = this.decodeFileName(fileName);
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(decodedFileName);
      
      const [exists] = await gcsFile.exists();
      if (!exists) {
        return { success: false, reference: fileName, error: 'File not found', code: 'FILE_NOT_FOUND' };
      }
      
      await gcsFile.delete();
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
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(reference);
      const [metadata] = await gcsFile.getMetadata();

      const actual = {
        contentType: metadata.contentType,
        fileSize: parseGcsFileSize(metadata.size),
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
   * Returns metadata about a file from GCS without downloading it.
   */
  async getMetadata(reference: string): Promise<FileInfo | null> {
    try {
      const decoded = this.decodeFileName(reference);
      const bucket = await this.ensureBucket();
      const gcsFile = bucket.file(decoded);
      const [exists] = await gcsFile.exists();
      if (!exists) return null;

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
