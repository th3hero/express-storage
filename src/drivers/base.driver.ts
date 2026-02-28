import fs from 'fs';
import fsPromises from 'fs/promises';
import { Readable } from 'stream';
import { IStorageDriver, FileUploadResult, PresignedUrlResult, PresignedUrlSuccess, StorageConfig, BlobValidationOptions, BlobValidationResult, BlobValidationSuccess, BlobValidationError, ListFilesResult, UploadOptions, DeleteResult, StorageErrorCode, FileInfo } from '../types/storage.types.js';
import { generateUniqueFileName } from '../utils/file.utils.js';

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
 * 
 * **Security validation contract:**
 * - **StorageManager** (layer 1): validates raw user input at the public API
 *   boundary — path traversal, MIME type format, file size limits.
 * - **Driver** (layer 2): decodes URL-encoded filenames via `decodeFileName()`
 *   and rejects traversal/encoding attacks. This ensures safety when drivers
 *   are used directly without StorageManager.
 * - **Local driver internals** (layer 3): containment checks (`path.resolve`
 *   stays within `basePath`), symlink rejection, file-type verification.
 *   These are filesystem-specific concerns, not input validation.
 */
export abstract class BaseStorageDriver implements IStorageDriver {
  protected readonly config: StorageConfig;
  protected readonly presignedMode: boolean;

  constructor(config: StorageConfig) {
    this.config = config;
    this.presignedMode = config.driver.endsWith('-presigned');
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
   * Uploads a single file. Each driver implements this differently.
   * When presignedMode is true, returns a presigned URL instead of uploading directly.
   */
  abstract upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;

  abstract generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;

  abstract generateViewUrl(fileName: string): Promise<PresignedUrlResult>;

  abstract delete(fileName: string): Promise<DeleteResult>;

  abstract listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;

  abstract getMetadata(reference: string): Promise<FileInfo | null>;

  /**
   * Releases SDK clients and internal resources. Override in drivers that
   * hold connection pools (S3Client, GCS Storage, Azure BlobServiceClient).
   * Default implementation is a no-op.
   */
  destroy(): void {
    // No-op — subclasses override to close SDK clients
  }

  /**
   * Creates a unique filename that won't collide with existing files.
   */
  protected generateFileName(originalName: string): string {
    return generateUniqueFileName(originalName);
  }

  // ---------------------------------------------------------------------------
  // Result builders — return proper discriminated union variants
  // ---------------------------------------------------------------------------

  protected createSuccessResult(reference: string, fileUrl: string): FileUploadResult {
    return { success: true, reference, fileUrl };
  }

  protected createErrorResult(error: string, code: StorageErrorCode = 'PROVIDER_ERROR'): FileUploadResult {
    return { success: false, error, code };
  }

  protected createPresignedSuccessResult(uploadUrl?: string, viewUrl?: string): PresignedUrlSuccess {
    const result: PresignedUrlSuccess = { success: true };
    if (uploadUrl) result.uploadUrl = uploadUrl;
    if (viewUrl) result.viewUrl = viewUrl;
    return result;
  }

  protected createPresignedErrorResult(error: string, code: StorageErrorCode = 'PROVIDER_ERROR'): PresignedUrlResult {
    return { success: false, error, code };
  }

  // ---------------------------------------------------------------------------
  // File validation
  // ---------------------------------------------------------------------------

  /**
   * Validates a file before upload.
   * 
   * Checks: missing file, no name, no MIME type, empty content, and
   * maxFileSize from config (enforced here so direct driver usage is safe).
   * 
   * Works with both Multer memory storage (file.buffer) and disk storage (file.path).
   */
  protected async validateFile(file: Express.Multer.File): Promise<{ errors: string[]; resolvedSize: number }> {
    const errors: string[] = [];

    if (!file) {
      errors.push('No file provided');
      return { errors, resolvedSize: 0 };
    }

    if (!file.originalname) {
      errors.push('File must have an original name');
    }

    if (!file.mimetype) {
      errors.push('File must have a MIME type');
    }

    const hasBuffer = (file.buffer?.length ?? 0) > 0;
    const hasPath = typeof file.path === 'string' && file.path.length > 0;
    const hasEmptyBuffer = file.buffer !== null && file.buffer !== undefined && file.buffer.length === 0;
    let resolvedSize = file.size || 0;
    
    if (hasEmptyBuffer && !hasPath) {
      errors.push('File is empty (0 bytes)');
    } else if (!hasBuffer && !hasPath) {
      errors.push('File must have either buffer (memory storage) or path (disk storage)');
    }

    if (hasPath && !hasBuffer) {
      try {
        const stats = await fsPromises.stat(file.path);
        if (stats.size === 0) {
          errors.push('File is empty (0 bytes)');
        }
        resolvedSize = stats.size;
      } catch {
        errors.push('Cannot read file from disk storage path');
      }
    }

    if (hasBuffer && !resolvedSize) {
      resolvedSize = file.buffer.length;
    }

    if (this.config.maxFileSize && resolvedSize > this.config.maxFileSize) {
      errors.push(`File size ${resolvedSize} exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
    }

    return { errors, resolvedSize };
  }

  // ---------------------------------------------------------------------------
  // File content helpers
  // ---------------------------------------------------------------------------

  /**
   * Reads the file content, whether it's in memory or on disk.
   * 
   * @warning **MEMORY IMPLICATIONS**: Loads the ENTIRE file into memory.
   * ALWAYS call `shouldUseStreaming(file)` first and use `getFileStream()` 
   * for files larger than 100MB.
   */
  protected async getFileContent(file: Express.Multer.File): Promise<Buffer> {
    if ((file.buffer?.length ?? 0) > 0) {
      return file.buffer;
    }
    
    if (file.path) {
      return fsPromises.readFile(file.path);
    }
    
    throw new Error('File has neither buffer nor path - cannot read content');
  }

  /**
   * Returns a readable stream for the file content.
   * Use this instead of getFileContent() for large files (>100MB).
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
   * Files larger than 100MB benefit from streaming to reduce memory usage.
   */
  protected shouldUseStreaming(fileSize: number): boolean {
    return fileSize > STREAM_THRESHOLD;
  }

  /**
   * Gets the file size, reading from disk if necessary.
   */
  protected async getFileSize(file: Express.Multer.File): Promise<number> {
    if (file.size && file.size > 0) {
      return file.size;
    }
    
    if (file.buffer?.length) {
      return file.buffer.length;
    }
    
    if (file.path) {
      try {
        const stats = await fsPromises.stat(file.path);
        return stats.size;
      } catch {
        return 0;
      }
    }
    
    return 0;
  }

  /**
   * Cleans up a Multer disk storage temp file if it exists.
   * Call this in upload error paths to prevent temp file leaks.
   */
  protected async cleanupTempFile(file: Express.Multer.File): Promise<void> {
    if (file.path) {
      try { await fsPromises.unlink(file.path); } catch { /* best-effort */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Presigned URL helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns how long presigned URLs should be valid (in seconds).
   * Clamped to [1, 604800] (1 second to 7 days). Default: 600 (10 minutes).
   */
  protected getPresignedUrlExpiry(): number {
    const MAX_EXPIRY = 604800;
    const MIN_EXPIRY = 1;
    const DEFAULT_EXPIRY = 600;
    
    const expiry = this.config.presignedUrlExpiry;
    
    if (expiry === undefined || Number.isNaN(expiry)) {
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
   * Decodes a URL-encoded filename and checks for path traversal attacks.
   * Throws on malformed encoding or traversal sequences.
   */
  protected decodeFileName(fileName: string): string {
    let decoded: string;
    try {
      decoded = decodeURIComponent(fileName);
    } catch {
      throw new Error('Invalid fileName: malformed URL encoding');
    }
    if (decoded.includes('..') || decoded.includes('\0')) {
      throw new Error('Invalid fileName: path traversal sequences are not allowed');
    }
    return decoded;
  }

  /**
   * Validates and clamps maxResults for list operations.
   */
  protected validateMaxResults(maxResults: number): number {
    return Math.floor(Math.max(1, Math.min(
      Number.isNaN(maxResults) ? 1000 : maxResults,
      1000
    )));
  }

  /**
   * Shared upload logic for presigned mode.
   * Validates the file, generates a unique name, and returns a presigned upload URL.
   */
  protected async presignedUpload(file: Express.Multer.File): Promise<FileUploadResult> {
    try {
      const { errors, resolvedSize } = await this.validateFile(file);
      if (errors.length > 0) {
        return this.createErrorResult(errors.join(', '), 'VALIDATION_FAILED');
      }

      const fileName = this.generateFileName(file.originalname);
      const filePath = this.buildFilePath(fileName);

      const presignedResult = await this.generateUploadUrl(
        filePath,
        file.mimetype,
        resolvedSize
      );

      if (!presignedResult.success) {
        return this.createErrorResult(presignedResult.error, presignedResult.code);
      }

      return this.createSuccessResult(filePath, presignedResult.uploadUrl || '');
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to generate presigned URL'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Upload validation (post-upload confirmation)
  // ---------------------------------------------------------------------------

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
      const result: BlobValidationSuccess = {
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
      error: viewResult.error,
      code: 'FILE_NOT_FOUND',
    };
  }

  /**
   * Validates uploaded file metadata against expected values.
   * Shared by cloud drivers to avoid duplicating content-type and file-size checks.
   * Returns a validation error result if checks fail, null if everything passes.
   */
  protected async checkUploadedFileMetadata(
    reference: string,
    actual: { contentType?: string | undefined; fileSize?: number | undefined },
    options?: BlobValidationOptions
  ): Promise<BlobValidationError | null> {
    const deleteOnFailure = options?.deleteOnFailure !== false;

    if (options?.expectedContentType && actual.contentType !== options.expectedContentType) {
      if (deleteOnFailure) await this.delete(reference);
      return this.buildValidationError(
        `Content type mismatch: expected '${options.expectedContentType}', got '${actual.contentType}'`,
        deleteOnFailure, actual.contentType, actual.fileSize
      );
    }

    if (options?.expectedFileSize !== undefined && actual.fileSize !== options.expectedFileSize) {
      if (deleteOnFailure) await this.delete(reference);
      return this.buildValidationError(
        `File size mismatch: expected ${options.expectedFileSize} bytes, got ${actual.fileSize} bytes`,
        deleteOnFailure, actual.contentType, actual.fileSize
      );
    }

    return null;
  }

  /**
   * Builds a successful validation result with optional view URL and metadata.
   */
  protected buildValidationSuccess(
    reference: string,
    viewUrl?: string,
    actualContentType?: string,
    actualFileSize?: number
  ): BlobValidationSuccess {
    const result: BlobValidationSuccess = {
      success: true,
      reference,
      expiresIn: this.getPresignedUrlExpiry(),
    };
    if (viewUrl) result.viewUrl = viewUrl;
    if (actualContentType) result.actualContentType = actualContentType;
    if (actualFileSize !== undefined) result.actualFileSize = actualFileSize;
    return result;
  }

  private buildValidationError(
    message: string,
    deleted: boolean,
    contentType?: string,
    fileSize?: number
  ): BlobValidationError {
    const result: BlobValidationError = {
      success: false,
      error: `${message}${deleted ? ' (file deleted)' : ' (file kept for inspection)'}`,
      code: 'VALIDATION_FAILED',
    };
    if (contentType) result.actualContentType = contentType;
    if (fileSize !== undefined) result.actualFileSize = fileSize;
    return result;
  }
}
