import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig } from '../types/storage.types.js';
/**
 * Google Cloud Storage driver
 */
export declare class GCSStorageDriver extends BaseStorageDriver {
    private storage;
    private bucket;
    private bucketName;
    private projectId;
    constructor(config: StorageConfig);
    /**
     * Upload file to GCS
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
    /**
     * Generate presigned upload URL
     * @param fileName - The name of the file to upload
     * @param contentType - Optional content type constraint
     * @param _maxSize - Optional max file size (GCS doesn't support size limits in signed URLs)
     */
    generateUploadUrl(fileName: string, contentType?: string, _maxSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate presigned view URL
     */
    generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    /**
     * Delete file from GCS
     */
    delete(fileName: string): Promise<boolean>;
}
/**
 * Google Cloud Storage presigned driver
 */
export declare class GCSPresignedStorageDriver extends GCSStorageDriver {
    constructor(config: StorageConfig);
    /**
     * Override upload to return presigned URL instead of direct upload
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
}
//# sourceMappingURL=gcs.driver.d.ts.map