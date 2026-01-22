import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig } from '../types/storage.types.js';
/**
 * AWS S3 storage driver
 */
export declare class S3StorageDriver extends BaseStorageDriver {
    private s3Client;
    private bucketName;
    private region;
    constructor(config: StorageConfig);
    /**
     * Upload file to S3
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
    /**
     * Generate presigned upload URL
     * @param fileName - Name of the file
     * @param contentType - Optional MIME type constraint
     * @param _maxSize - Optional max file size (S3 doesn't support size limits in presigned URLs)
     */
    generateUploadUrl(fileName: string, contentType?: string, _maxSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate presigned view URL
     */
    generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    /**
     * Delete file from S3
     */
    delete(fileName: string): Promise<boolean>;
}
/**
 * AWS S3 presigned storage driver
 */
export declare class S3PresignedStorageDriver extends S3StorageDriver {
    constructor(config: StorageConfig);
    /**
     * Override upload to return presigned URL instead of direct upload
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
}
//# sourceMappingURL=s3.driver.d.ts.map