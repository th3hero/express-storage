import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig } from '../types/storage.types.js';

/**
 * AWS S3 storage driver
 */
export class S3StorageDriver extends BaseStorageDriver {
  private s3Client: S3Client;
  private bucketName: string;
  private region: string;

  constructor(config: StorageConfig) {
    super(config);
    
    this.bucketName = config.bucketName!;
    this.region = config.awsRegion!;
    
    // Build S3 client options
    const s3Options: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
      region: this.region,
    };

    // Only provide explicit credentials if access keys are provided
    // When running on AWS (EC2, ECS, Lambda, etc.), IAM roles are used automatically
    // via the default credential provider chain
    if (config.awsAccessKey && config.awsSecretKey) {
      s3Options.credentials = {
        accessKeyId: config.awsAccessKey,
        secretAccessKey: config.awsSecretKey,
      };
    }
    
    this.s3Client = new S3Client(s3Options);
  }

  /**
   * Upload file to S3
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
      
      // Create S3 upload command
      const uploadCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      });

      // Upload to S3
      await this.s3Client.send(uploadCommand);
      
      // Generate file URL
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fileName}`;
      
      return this.createSuccessResult(fileName, fileUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file to S3'
      );
    }
  }

  /**
   * Generate presigned upload URL
   * @param fileName - Name of the file
   * @param contentType - Optional MIME type constraint
   * @param _maxSize - Optional max file size (S3 doesn't support size limits in presigned URLs)
   */
  async generateUploadUrl(fileName: string, contentType?: string, _maxSize?: number): Promise<PresignedUrlResult> {
    try {
      const uploadCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        ContentType: contentType || 'application/octet-stream',
      });

      const uploadUrl = await getSignedUrl(this.s3Client, uploadCommand, {
        expiresIn: this.getPresignedUrlExpiry(),
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
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
      });

      const viewUrl = await getSignedUrl(this.s3Client, getCommand, {
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
   * Delete file from S3
   */
  async delete(fileName: string): Promise<boolean> {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
      });

      await this.s3Client.send(deleteCommand);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * AWS S3 presigned storage driver
 */
export class S3PresignedStorageDriver extends S3StorageDriver {
  constructor(config: StorageConfig) {
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
