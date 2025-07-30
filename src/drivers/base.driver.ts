import { IStorageDriver, FileUploadResult, PresignedUrlResult, StorageConfig } from '../types/storage.types.js';
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
   * Upload a single file
   */
  abstract upload(file: Express.Multer.File): Promise<FileUploadResult>;

  /**
   * Upload multiple files
   */
  async uploadMultiple(files: Express.Multer.File[]): Promise<FileUploadResult[]> {
    const results: FileUploadResult[] = [];
    
    for (const file of files) {
      try {
        const result = await this.upload(file);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }
    
    return results;
  }

  /**
   * Generate upload URL (for presigned drivers)
   */
  abstract generateUploadUrl(fileName: string): Promise<PresignedUrlResult>;

  /**
   * Generate view URL (for presigned drivers)
   */
  abstract generateViewUrl(fileName: string): Promise<PresignedUrlResult>;

  /**
   * Generate multiple upload URLs
   */
  async generateMultipleUploadUrls(fileNames: string[]): Promise<PresignedUrlResult[]> {
    const results: PresignedUrlResult[] = [];
    
    for (const fileName of fileNames) {
      try {
        const result = await this.generateUploadUrl(fileName);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate upload URL',
        });
      }
    }
    
    return results;
  }

  /**
   * Generate multiple view URLs
   */
  async generateMultipleViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]> {
    const results: PresignedUrlResult[] = [];
    
    for (const fileName of fileNames) {
      try {
        const result = await this.generateViewUrl(fileName);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate view URL',
        });
      }
    }
    
    return results;
  }

  /**
   * Delete a single file
   */
  abstract delete(fileName: string): Promise<boolean>;

  /**
   * Delete multiple files
   */
  async deleteMultiple(fileNames: string[]): Promise<boolean[]> {
    const results: boolean[] = [];
    
    for (const fileName of fileNames) {
      try {
        const result = await this.delete(fileName);
        results.push(result);
      } catch (error) {
        results.push(false);
      }
    }
    
    return results;
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

    if (!file.buffer || file.buffer.length === 0) {
      errors.push('File buffer is empty');
    }

    return errors;
  }

  /**
   * Get presigned URL expiry time
   */
  protected getPresignedUrlExpiry(): number {
    return this.config.presignedUrlExpiry || 600; // Default 10 minutes
  }
} 