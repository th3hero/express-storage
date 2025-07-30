import { Storage, Bucket } from '@google-cloud/storage';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult } from '../types/storage.types.js';

/**
 * Google Cloud Storage driver
 */
export class GCSStorageDriver extends BaseStorageDriver {
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;
  private projectId: string;

  constructor(config: any) {
    super(config);
    
    this.bucketName = config.bucketName!;
    this.projectId = config.gcsProjectId!;
    
    // Initialize GCS client
    this.storage = new Storage({
      projectId: this.projectId,
      keyFilename: config.gcsCredentials,
    });
    
    this.bucket = this.storage.bucket(this.bucketName);
  }

  /**
   * Upload file to GCS
   */
  async upload(file: Express.Multer.File): Promise<FileUploadResult> {
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
      
      // Upload file
      await gcsFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
      });
      
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
   */
  async generateUploadUrl(fileName: string): Promise<PresignedUrlResult> {
    try {
      const gcsFile = this.bucket.file(fileName);
      
      const [uploadUrl] = await gcsFile.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + (this.getPresignedUrlExpiry() * 1000),
        contentType: 'application/octet-stream',
      });

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
   */
  async delete(fileName: string): Promise<boolean> {
    try {
      const gcsFile = this.bucket.file(fileName);
      await gcsFile.delete();
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Google Cloud Storage presigned driver
 */
export class GCSPresignedStorageDriver extends GCSStorageDriver {
  constructor(config: any) {
    super(config);
  }

  /**
   * Override upload to return presigned URL instead of direct upload
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
      
      // Generate presigned upload URL
      const presignedResult = await this.generateUploadUrl(fileName);
      
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