import fs from 'fs';
import { Readable } from 'stream';
import { IStorageDriver, FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, DeleteResult } from '../types/storage.types.js';
import { generateUniqueFileName, withConcurrencyLimit } from '../utils/file.utils.js';

/** Threshold for using streaming uploads (100MB) */
const STREAM_THRESHOLD = 100 * 1024 * 1024;

/**
 * BaseStorageDriver - The foundation that all storage drivers build upon.
 * 
 * This abstract class provides common functionality that every driver needs:
 * filename generation, file validation, content reading, and result formatting.
 * 
 * If you're building a custom driver, extend this class and implement the
 * abstract methods. You'll get all the helper methods for free.
 */
export abstract class BaseStorageDriver implements IStorageDriver {
  protected config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Builds the full storage path by combining the bucket path with the filename.
   * For example: 'uploads' + 'photo.jpg' = 'uploads/photo.jpg'
   */
  protected buildFilePath(fileName: string): string {
    const bucketPath = this.config.bucketPath?.trim();
    if (!bucketPath || bucketPath === '' || bucketPath === '/') {
      return fileName;
    }
    const normalizedPath = bucketPath.replace(/^\/+|\/+$/g, '');
    return `${normalizedPath}/${fileName}`;
  }

  /**
   * Returns the configured bucket path, cleaned up and ready to use.
   */
  protected getBucketPath(): string {
    return this.config.bucketPath?.trim()?.replace(/^\/+|\/+$/g, '') || '';
  }

  /**
   * Uploads a single file. Each driver implements this differently.
   */
  abstract upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;

  /**
   * Uploads multiple files with smart concurrency control.
   * Processes up to 10 files at a time to balance speed and system resources.
   */
  async uploadMultiple(files: Express.Multer.File[], options?: UploadOptions): Promise<FileUploadResult[]> {
    if (!files || files.length === 0) {
      return [];
    }
    
    return withConcurrencyLimit(
      files,
      async (file): Promise<FileUploadResult> => {
        try {
          return await this.upload(file, options);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to upload file',
          };
        }
      },
      { maxConcurrent: 10 }
    );
  }

  /**
   * Creates a presigned URL for uploading.
   * Each cloud provider has its own way of doing this.
   */
  abstract generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;

  /**
   * Creates a presigned URL for viewing/downloading.
   */
  abstract generateViewUrl(fileName: string): Promise<PresignedUrlResult>;

  /**
   * Deletes a file from storage.
   */
  abstract delete(fileName: string): Promise<boolean>;

  /**
   * Lists files with optional filtering and pagination.
   */
  abstract listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;

  /**
   * Deletes multiple files with smart concurrency control.
   * Returns detailed results so you know exactly what happened with each file.
   */
  async deleteMultiple(fileNames: string[]): Promise<DeleteResult[]> {
    if (!fileNames || fileNames.length === 0) {
      return [];
    }
    
    return withConcurrencyLimit(
      fileNames,
      async (fileName): Promise<DeleteResult> => {
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
      },
      { maxConcurrent: 10 }
    );
  }

  /**
   * Creates a unique filename that won't collide with existing files.
   * Format: {timestamp}_{random}_{original_name}.{ext}
   */
  protected generateFileName(originalName: string): string {
    return generateUniqueFileName(originalName);
  }

  /**
   * Builds a success response for upload operations.
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
   * Builds an error response for upload operations.
   */
  protected createErrorResult(error: string): FileUploadResult {
    return {
      success: false,
      error,
    };
  }

  /**
   * Builds a success response for presigned URL operations.
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
   * Builds an error response for presigned URL operations.
   */
  protected createPresignedErrorResult(error: string): PresignedUrlResult {
    return {
      success: false,
      error,
    };
  }

  /**
   * Validates a file before upload.
   * 
   * Checks for common issues:
   * - Missing file
   * - No original name
   * - No MIME type  
   * - Empty content
   * 
   * Works with both Multer memory storage (file.buffer) and disk storage (file.path).
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

    // Check for file content (could be in memory or on disk)
    const hasBuffer = (file.buffer?.length ?? 0) > 0;
    const hasPath = typeof file.path === 'string' && file.path.length > 0;
    const hasEmptyBuffer = file.buffer !== null && file.buffer !== undefined && file.buffer.length === 0;
    
    if (hasEmptyBuffer && !hasPath) {
      errors.push('File is empty (0 bytes)');
    } else if (!hasBuffer && !hasPath) {
      errors.push('File must have either buffer (memory storage) or path (disk storage)');
    }

    // For disk storage, verify the file exists and isn't empty
    if (hasPath && !hasBuffer) {
      try {
        const stats = fs.statSync(file.path);
        if (stats.size === 0) {
          errors.push('File is empty (0 bytes)');
        }
        if (!file.size || file.size === 0) {
          file.size = stats.size;
        }
      } catch {
        errors.push('Cannot read file from disk storage path');
      }
    }

    return errors;
  }

  /**
   * Reads the file content, whether it's in memory or on disk.
   * 
   * Note: For disk storage, this reads the file but doesn't delete it.
   * Call cleanupTempFile() afterward if you need to remove the temp file.
   * 
   * @warning **MEMORY IMPLICATIONS**: This method loads the ENTIRE file into memory.
   * For large files, this can cause memory exhaustion and application crashes.
   * 
   * **ALWAYS call `shouldUseStreaming(file)` first** and use `getFileStream()` 
   * for files larger than 100MB. Example:
   * 
   * ```typescript
   * if (this.shouldUseStreaming(file)) {
   *   return this.uploadWithStream(file);
   * }
   * const content = this.getFileContent(file); // Safe for smaller files
   * ```
   * 
   * Memory usage: A 1GB file will allocate ~1GB of heap memory.
   * Node.js default heap limit is ~1.5GB, so large files WILL crash your app.
   * 
   * @param file - The Multer file object
   * @returns Buffer containing the entire file contents
   * @throws Error if file has neither buffer nor path
   */
  protected getFileContent(file: Express.Multer.File): Buffer {
    if ((file.buffer?.length ?? 0) > 0) {
      return file.buffer;
    }
    
    if (file.path) {
      return fs.readFileSync(file.path);
    }
    
    throw new Error('File has neither buffer nor path - cannot read content');
  }

  /**
   * Returns a readable stream for the file content.
   * 
   * Use this instead of getFileContent() for large files to avoid
   * loading the entire file into memory. Particularly useful for
   * files larger than 100MB.
   * 
   * @param file - The Multer file object
   * @returns A readable stream of the file content
   */
  protected getFileStream(file: Express.Multer.File): Readable {
    if ((file.buffer?.length ?? 0) > 0) {
      return Readable.from(file.buffer);
    }
    
    if (file.path) {
      return fs.createReadStream(file.path);
    }
    
    throw new Error('File has neither buffer nor path - cannot create stream');
  }

  /**
   * Determines if a file should use streaming based on its size.
   * 
   * Files larger than 100MB benefit from streaming to reduce memory usage.
   * 
   * @param file - The Multer file object
   * @returns true if the file should use streaming
   */
  protected shouldUseStreaming(file: Express.Multer.File): boolean {
    const size = file.size || 0;
    return size > STREAM_THRESHOLD;
  }

  /**
   * Gets the file size, reading from disk if necessary.
   * 
   * @param file - The Multer file object
   * @returns The file size in bytes
   */
  protected getFileSize(file: Express.Multer.File): number {
    if (file.size && file.size > 0) {
      return file.size;
    }
    
    if (file.buffer?.length) {
      return file.buffer.length;
    }
    
    if (file.path) {
      try {
        const stats = fs.statSync(file.path);
        return stats.size;
      } catch {
        return 0;
      }
    }
    
    return 0;
  }

  /**
   * Removes a temporary file created by Multer disk storage.
   * 
   * Call this after a successful upload if you're using disk storage
   * and want to clean up. Memory storage doesn't need this — the
   * garbage collector handles cleanup automatically.
   * 
   * @returns true if the file was deleted, false otherwise
   */
  public cleanupTempFile(file: Express.Multer.File): boolean {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Returns how long presigned URLs should be valid (in seconds).
   * 
   * Clamps the value to stay within cloud provider limits:
   * - Minimum: 1 second
   * - Maximum: 7 days (604800 seconds)
   * - Default: 10 minutes (600 seconds)
   */
  protected getPresignedUrlExpiry(): number {
    const MAX_EXPIRY = 604800;
    const MIN_EXPIRY = 1;
    const DEFAULT_EXPIRY = 600;
    
    const expiry = this.config.presignedUrlExpiry;
    
    if (expiry === undefined || expiry === null || Number.isNaN(expiry)) {
      return DEFAULT_EXPIRY;
    }
    
    if (expiry < MIN_EXPIRY) {
      return MIN_EXPIRY;
    }
    if (expiry > MAX_EXPIRY) {
      return MAX_EXPIRY;
    }
    
    return expiry;
  }

  /**
   * Confirms that an upload completed successfully.
   * 
   * The default implementation just checks if the file exists.
   * Azure overrides this to validate file properties since Azure
   * doesn't enforce constraints at the presigned URL level.
   */
  async validateAndConfirmUpload(reference: string, _options?: BlobValidationOptions): Promise<BlobValidationResult> {
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
