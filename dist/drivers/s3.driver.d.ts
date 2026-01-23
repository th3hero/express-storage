import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions } from '../types/storage.types.js';
/**
 * AWS S3 storage driver
 */
export declare class S3StorageDriver extends BaseStorageDriver {
    private s3Client;
    private bucketName;
    private region;
    constructor(config: StorageConfig);
    /**
     * Upload file to S3 with optional metadata
     */
    upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;
    /**
     * Generate presigned upload URL
     * @param fileName - Name of the file (will be the exact key in S3)
     * @param contentType - MIME type constraint (defaults to 'application/octet-stream' if not provided)
     * @param fileSize - Exact file size in bytes (enforced via ContentLength in signature)
     */
    generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate presigned view URL
     */
    generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    /**
     * Delete file from S3
     * First verifies file exists, then deletes it
     */
    delete(fileName: string): Promise<boolean>;
    /**
     * Validate and confirm upload - verifies file exists and returns metadata
     */
    validateAndConfirmUpload(reference: string, _options?: BlobValidationOptions): Promise<BlobValidationResult>;
    /**
     * List files in S3 bucket with optional prefix and pagination
     */
    listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;
}
/**
 * AWS S3 presigned storage driver
 */
export declare class S3PresignedStorageDriver extends S3StorageDriver {
    constructor(config: StorageConfig);
    /**
     * Override upload to return presigned URL instead of direct upload
     * Includes content type and file size constraints for validation
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
}
//# sourceMappingURL=s3.driver.d.ts.map