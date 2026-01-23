import { Storage, Bucket } from '@google-cloud/storage';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo } from '../types/storage.types.js';
import type { File } from '@google-cloud/storage';

/**
 * Google Cloud Storage driver
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
    
    // Initialize GCS client
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
   * Upload file to GCS with optional metadata
   */
  async upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult> {
    try {
      // Validate file
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '));
      }

      // Generate unique filename
      const fileName = this.generateFileName(file.originalname);
      
      // Create file reference
      const gcsFile = this.bucket.file(fileName);
      
      // Build metadata
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

      // Get file content (supports both memory and disk storage)
      const fileContent = this.getFileContent(file);

      // Upload file
      await gcsFile.save(fileContent, { metadata });
      
      // Generate file URL
      const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
      
      return this.createSuccessResult(fileName, fileUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file to GCS'
      );
    }
  }

  /**
   * Generate presigned upload URL
   * @param fileName - The name of the file to upload (exact object name in GCS)
   * @param contentType - Content type constraint (defaults to 'application/octet-stream' if not provided)
   * @param fileSize - Exact file size in bytes (enforced via x-goog-content-length-range extension header)
   */
  async generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult> {
    try {
      const gcsFile = this.bucket.file(fileName);
      
      // Default to 'application/octet-stream' if contentType not provided
      const resolvedContentType = contentType || 'application/octet-stream';
      
      // Build signed URL options
      const options: {
        version: 'v4';
        action: 'write';
        expires: number;
        contentType: string;
        extensionHeaders?: Record<string, string>;
      } = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + (this.getPresignedUrlExpiry() * 1000),
        contentType: resolvedContentType,
      };

      // Add content-length-range extension header to enforce exact file size
      // This restricts the upload to accept only the exact file size specified
      if (fileSize) {
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
   * Generate presigned view URL
   */
  async generateViewUrl(fileName: string): Promise<PresignedUrlResult> {
    try {
      const gcsFile = this.bucket.file(fileName);
      
      const [viewUrl] = await gcsFile.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + (this.getPresignedUrlExpiry() * 1000),
      });

      return this.createPresignedSuccessResult(undefined, viewUrl);
    } catch (error) {
      return this.createPresignedErrorResult(
        error instanceof Error ? error.message : 'Failed to generate view URL'
      );
    }
  }

  /**
   * Delete file from GCS
   * First verifies file exists, then deletes it
   */
  async delete(fileName: string): Promise<boolean> {
    try {
      const gcsFile = this.bucket.file(fileName);
      
      // Check if file exists first
      const [exists] = await gcsFile.exists();
      if (!exists) {
        return false;
      }
      
      await gcsFile.delete();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate and confirm upload - verifies file exists and returns metadata
   */
  override async validateAndConfirmUpload(
    reference: string,
    _options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    try {
      const gcsFile = this.bucket.file(reference);
      
      // Get file metadata to verify it exists
      const [metadata] = await gcsFile.getMetadata();

      // Generate view URL
      const viewResult = await this.generateViewUrl(reference);

      const result: BlobValidationResult = {
        success: true,
        reference,
        expiresIn: this.getPresignedUrlExpiry(),
      };
      
      if (viewResult.viewUrl) {
        result.viewUrl = viewResult.viewUrl;
      }
      if (metadata.contentType) {
        result.actualContentType = metadata.contentType;
      }
      if (metadata.size !== undefined) {
        result.actualFileSize = typeof metadata.size === 'string' 
          ? parseInt(metadata.size, 10) 
          : metadata.size;
      }

      return result;
    } catch {
      return {
        success: false,
        error: 'File not found or access denied',
      };
    }
  }

  /**
   * List files in GCS bucket with optional prefix and pagination
   */
  async listFiles(
    prefix?: string,
    maxResults: number = 1000,
    continuationToken?: string
  ): Promise<ListFilesResult> {
    try {
      // Build options object conditionally
      const options: { prefix?: string; maxResults: number; pageToken?: string } = {
        maxResults,
      };
      if (prefix) options.prefix = prefix;
      if (continuationToken) options.pageToken = continuationToken;

      const [files, , apiResponse] = await this.bucket.getFiles(options);

      const fileList: FileInfo[] = files.map((file: File) => {
        const fileInfo: FileInfo = { name: file.name };
        if (file.metadata.size) {
          fileInfo.size = parseInt(String(file.metadata.size), 10);
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

      // Check for pagination token in response
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
 * Google Cloud Storage presigned driver
 */
export class GCSPresignedStorageDriver extends GCSStorageDriver {
  constructor(config: StorageConfig) {
    super(config);
  }

  /**
   * Override upload to return presigned URL instead of direct upload
   * Includes content type and file size constraints for validation
   */
  override async upload(file: Express.Multer.File): Promise<FileUploadResult> {
    try {
      // Validate file
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '));
      }

      // Generate unique filename
      const fileName = this.generateFileName(file.originalname);
      
      // Generate presigned upload URL with constraints
      const presignedResult = await this.generateUploadUrl(
        fileName,
        file.mimetype,  // Pass content type for enforcement
        file.size       // Pass file size for enforcement
      );
      
      if (!presignedResult.success) {
        return this.createErrorResult(presignedResult.error || 'Failed to generate presigned URL');
      }

      return this.createSuccessResult(fileName, presignedResult.uploadUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to generate presigned URL'
      );
    }
  }
}
