import { Storage, Bucket } from '@google-cloud/storage';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo } from '../types/storage.types.js';
import type { File } from '@google-cloud/storage';

/**
 * GCSStorageDriver - Handles file operations with Google Cloud Storage.
 * 
 * Supports two authentication methods:
 * 1. Service account JSON file (GCS_CREDENTIALS path)
 * 2. Application Default Credentials (when running on GCP)
 * 
 * If you're running on GCP (Cloud Run, GKE, etc.), you usually don't need
 * to provide credentials — the SDK picks them up automatically.
 */
export class GCSStorageDriver extends BaseStorageDriver {
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;
  private projectId: string;

  constructor(config: StorageConfig) {
    super(config);
    
    this.bucketName = config.bucketName!;
    this.projectId = config.gcsProjectId!;
    
    const storageOptions: { projectId: string; keyFilename?: string } = {
      projectId: this.projectId,
    };
    
    if (config.gcsCredentials) {
      storageOptions.keyFilename = config.gcsCredentials;
    }
    
    this.storage = new Storage(storageOptions);
    this.bucket = this.storage.bucket(this.bucketName);
  }

  /**
   * Uploads a file directly to GCS.
   * Handles both memory and disk storage from Multer.
   * 
   * For large files (>100MB), uses streaming upload to reduce
   * memory usage and improve reliability.
   */
  async upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult> {
    try {
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '));
      }

      const fileName = this.generateFileName(file.originalname);
      const filePath = this.buildFilePath(fileName);
      const gcsFile = this.bucket.file(filePath);
      
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

      // Use streaming upload for large files to reduce memory usage
      if (this.shouldUseStreaming(file)) {
        await this.uploadWithStream(gcsFile, file, metadata);
      } else {
        const fileContent = this.getFileContent(file);
        await gcsFile.save(fileContent, { metadata });
      }
      
      // Build the public URL with proper encoding
      const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
      const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${encodedPath}`;
      
      return this.createSuccessResult(filePath, fileUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file to GCS'
      );
    }
  }

  /**
   * Uploads a large file using streaming.
   * 
   * This method pipes the file stream directly to GCS, which is more
   * memory-efficient for large files.
   */
  private async uploadWithStream(
    gcsFile: File,
    file: Express.Multer.File,
    metadata: { contentType: string; cacheControl?: string; contentDisposition?: string; metadata?: Record<string, string> }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = this.getFileStream(file);
      const writeStream = gcsFile.createWriteStream({
        metadata,
        resumable: true, // Enable resumable uploads for reliability
      });

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
   * 
   * Clients that try to upload different content will get a 403.
   */
  async generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult> {
    // Security: Defense-in-depth validation (StorageManager also validates)
    if (fileName.includes('..') || fileName.includes('\0')) {
      return this.createPresignedErrorResult('Invalid fileName: path traversal sequences are not allowed');
    }
    
    try {
      const gcsFile = this.bucket.file(fileName);
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

      // GCS enforces exact file size via this header
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
    // Security: Defense-in-depth validation
    if (fileName.includes('..') || fileName.includes('\0')) {
      return this.createPresignedErrorResult('Invalid fileName: path traversal sequences are not allowed');
    }
    
    try {
      const gcsFile = this.bucket.file(fileName);
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
   * Returns false if the file doesn't exist, throws on real errors.
   */
  async delete(fileName: string): Promise<boolean> {
    // Security: Defense-in-depth validation
    if (fileName.includes('..') || fileName.includes('\0')) {
      return false;
    }
    
    const gcsFile = this.bucket.file(fileName);
    
    const [exists] = await gcsFile.exists();
    if (!exists) {
      return false;
    }
    
    await gcsFile.delete();
    return true;
  }

  /**
   * Confirms an upload and optionally validates the file.
   * 
   * For GCS, validation is optional since constraints are enforced at URL level.
   * But you can still use this to verify the file matches expectations.
   */
  override async validateAndConfirmUpload(
    reference: string,
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    const deleteOnFailure = options?.deleteOnFailure !== false;
    
    try {
      const gcsFile = this.bucket.file(reference);
      const [metadata] = await gcsFile.getMetadata();

      const actualContentType = metadata.contentType;
      let actualFileSize: number | undefined;
      if (metadata.size !== undefined) {
        const parsed = typeof metadata.size === 'string' ? parseInt(metadata.size, 10) : metadata.size;
        actualFileSize = Number.isNaN(parsed) ? undefined : parsed;
      }

      // Validate content type if expected
      if (options?.expectedContentType && actualContentType !== options.expectedContentType) {
        if (deleteOnFailure) {
          await this.delete(reference);
        }
        const errorResult: BlobValidationResult = {
          success: false,
          error: `Content type mismatch: expected '${options.expectedContentType}', got '${actualContentType}'${deleteOnFailure ? ' (file deleted)' : ' (file kept for inspection)'}`,
        };
        if (actualContentType) errorResult.actualContentType = actualContentType;
        if (actualFileSize !== undefined) errorResult.actualFileSize = actualFileSize;
        return errorResult;
      }

      // Validate file size if expected
      if (options?.expectedFileSize !== undefined && actualFileSize !== options.expectedFileSize) {
        if (deleteOnFailure) {
          await this.delete(reference);
        }
        const errorResult: BlobValidationResult = {
          success: false,
          error: `File size mismatch: expected ${options.expectedFileSize} bytes, got ${actualFileSize} bytes${deleteOnFailure ? ' (file deleted)' : ' (file kept for inspection)'}`,
        };
        if (actualContentType) errorResult.actualContentType = actualContentType;
        if (actualFileSize !== undefined) errorResult.actualFileSize = actualFileSize;
        return errorResult;
      }

      const viewResult = await this.generateViewUrl(reference);

      const result: BlobValidationResult = {
        success: true,
        reference,
        expiresIn: this.getPresignedUrlExpiry(),
      };
      
      if (viewResult.viewUrl) {
        result.viewUrl = viewResult.viewUrl;
      }
      if (actualContentType) {
        result.actualContentType = actualContentType;
      }
      if (actualFileSize !== undefined) {
        result.actualFileSize = actualFileSize;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'File not found or access denied';
      return {
        success: false,
        error: errorMessage,
      };
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
      const validatedMaxResults = Math.floor(Math.max(1, Math.min(
        Number.isNaN(maxResults) ? 1000 : maxResults, 
        1000
      )));
      
      const options: { prefix?: string; maxResults: number; pageToken?: string } = {
        maxResults: validatedMaxResults,
      };
      if (prefix) options.prefix = prefix;
      if (continuationToken) options.pageToken = continuationToken;

      const [files, , apiResponse] = await this.bucket.getFiles(options);

      const fileList: FileInfo[] = files.map((file: File) => {
        const fileInfo: FileInfo = { name: file.name };
        if (file.metadata.size) {
          const parsed = parseInt(String(file.metadata.size), 10);
          if (!Number.isNaN(parsed)) {
            fileInfo.size = parsed;
          }
        }
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
      };
    }
  }
}

/**
 * GCSPresignedStorageDriver - GCS driver that returns presigned URLs from upload().
 * 
 * Use this when you want clients to upload directly to GCS without
 * the file passing through your server.
 */
export class GCSPresignedStorageDriver extends GCSStorageDriver {
  constructor(config: StorageConfig) {
    super(config);
  }

  /**
   * Instead of uploading the file, returns a presigned URL for the client to use.
   * 
   * The returned fileUrl is the presigned upload URL.
   * After the client uploads, use validateAndConfirmUpload() to get a view URL.
   * 
   * Note: The `options` parameter (metadata, cacheControl, etc.) is NOT applied
   * when using presigned uploads. These options must be set by the client when
   * making the actual upload request to GCS, or configured via bucket settings.
   * For server-side uploads with full options support, use the regular 'gcs' driver.
   */
  override async upload(file: Express.Multer.File, _options?: UploadOptions): Promise<FileUploadResult> {
    try {
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '));
      }

      const fileName = this.generateFileName(file.originalname);
      const filePath = this.buildFilePath(fileName);
      
      const presignedResult = await this.generateUploadUrl(
        filePath,
        file.mimetype,
        file.size
      );
      
      if (!presignedResult.success) {
        return this.createErrorResult(presignedResult.error || 'Failed to generate presigned URL');
      }

      return this.createSuccessResult(filePath, presignedResult.uploadUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to generate presigned URL'
      );
    }
  }
}
