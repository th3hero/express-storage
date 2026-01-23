import fs from 'fs';
import { IStorageDriver, FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileMetadata, DeleteResult } from '../types/storage.types.js';
import { generateUniqueFileName } from '../utils/file.utils.js';

/**
 * Abstract base class for all storage drivers
 */
export abstract class BaseStorageDriver implements IStorageDriver {
  protected config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Upload a single file with optional metadata
   */
  abstract upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;

  /**
   * Upload multiple files in parallel with optional metadata
   */
  async uploadMultiple(files: Express.Multer.File[], options?: UploadOptions): Promise<FileUploadResult[]> {
    return Promise.all(
      files.map(file =>
        this.upload(file, options).catch(error => ({
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
        }))
      )
    );
  }

  /**
   * Generate upload URL (for presigned drivers)
   * @param fileName - Name of the file (exact key/blob name)
   * @param contentType - MIME type constraint (enforced in signature)
   * @param fileSize - Exact file size in bytes (enforced in S3, informational for GCS/Azure)
   */
  abstract generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;

  /**
   * Generate view URL (for presigned drivers)
   */
  abstract generateViewUrl(fileName: string): Promise<PresignedUrlResult>;

  /**
   * Generate multiple upload URLs in parallel with optional constraints
   */
  async generateMultipleUploadUrls(files: FileMetadata[]): Promise<PresignedUrlResult[]> {
    return Promise.all(
      files.map(file =>
        this.generateUploadUrl(file.fileName, file.contentType, file.fileSize).catch(error => ({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate upload URL',
        }))
      )
    );
  }

  /**
   * Generate multiple view URLs in parallel
   */
  async generateMultipleViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]> {
    return Promise.all(
      fileNames.map(fileName =>
        this.generateViewUrl(fileName).catch(error => ({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate view URL',
        }))
      )
    );
  }

  /**
   * Delete a single file
   */
  abstract delete(fileName: string): Promise<boolean>;

  /**
   * List files with optional prefix and pagination
   */
  abstract listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;

  /**
   * Delete multiple files in parallel
   * Returns detailed results including error messages for failed deletions
   */
  async deleteMultiple(fileNames: string[]): Promise<DeleteResult[]> {
    return Promise.all(
      fileNames.map(async (fileName) => {
        try {
          const success = await this.delete(fileName);
          const result: DeleteResult = { success, fileName };
          if (!success) {
            result.error = 'File not found or already deleted';
          }
          return result;
        } catch (error) {
          return {
            success: false,
            fileName,
            error: error instanceof Error ? error.message : 'Failed to delete file',
          };
        }
      })
    );
  }

  /**
   * Generate unique filename with timestamp
   */
  protected generateFileName(originalName: string): string {
    return generateUniqueFileName(originalName);
  }

  /**
   * Create success result
   */
  protected createSuccessResult(fileName: string, fileUrl?: string): FileUploadResult {
    const result: FileUploadResult = {
      success: true,
      fileName,
    };
    if (fileUrl) {
      result.fileUrl = fileUrl;
    }
    return result;
  }

  /**
   * Create error result
   */
  protected createErrorResult(error: string): FileUploadResult {
    return {
      success: false,
      error,
    };
  }

  /**
   * Create presigned success result
   */
  protected createPresignedSuccessResult(uploadUrl?: string, viewUrl?: string): PresignedUrlResult {
    const result: PresignedUrlResult = {
      success: true,
    };
    if (uploadUrl) {
      result.uploadUrl = uploadUrl;
    }
    if (viewUrl) {
      result.viewUrl = viewUrl;
    }
    return result;
  }

  /**
   * Create presigned error result
   */
  protected createPresignedErrorResult(error: string): PresignedUrlResult {
    return {
      success: false,
      error,
    };
  }

  /**
   * Validate file before upload
   * Supports both memory storage (buffer) and disk storage (path)
   */
  protected validateFile(file: Express.Multer.File): string[] {
    const errors: string[] = [];

    if (!file) {
      errors.push('No file provided');
      return errors;
    }

    if (!file.originalname) {
      errors.push('File must have an original name');
    }

    if (!file.mimetype) {
      errors.push('File must have a MIME type');
    }

    // Check for either buffer (memory storage) or path (disk storage)
    const hasBuffer = file.buffer && file.buffer.length > 0;
    const hasPath = typeof file.path === 'string' && file.path.length > 0;
    
    if (!hasBuffer && !hasPath) {
      errors.push('File must have either buffer (memory storage) or path (disk storage)');
    }

    return errors;
  }

  /**
   * Get file content from either buffer (memory storage) or disk (disk storage)
   * Supports both Multer storage configurations
   */
  protected getFileContent(file: Express.Multer.File): Buffer {
    // Prefer buffer if available (memory storage)
    if (file.buffer && file.buffer.length > 0) {
      return file.buffer;
    }
    
    // Fall back to reading from disk (disk storage)
    if (file.path) {
      return fs.readFileSync(file.path);
    }
    
    throw new Error('File has neither buffer nor path - cannot read content');
  }

  /**
   * Get presigned URL expiry time
   */
  protected getPresignedUrlExpiry(): number {
    return this.config.presignedUrlExpiry || 600; // Default 10 minutes
  }

  /**
   * Validate and confirm upload (for Azure post-upload validation)
   * Default implementation just generates view URL (S3/GCS validate at URL level)
   * Azure overrides this to check blob properties
   */
  async validateAndConfirmUpload(reference: string, _options?: BlobValidationOptions): Promise<BlobValidationResult> {
    // Default: just verify file exists by generating view URL
    const viewResult = await this.generateViewUrl(reference);
    
    if (viewResult.success) {
      const result: BlobValidationResult = {
        success: true,
        reference,
        expiresIn: this.getPresignedUrlExpiry(),
      };
      if (viewResult.viewUrl) {
        result.viewUrl = viewResult.viewUrl;
      }
      return result;
    }
    
    return {
      success: false,
      error: viewResult.error || 'File not found',
    };
  }
}
