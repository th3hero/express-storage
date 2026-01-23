import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions } from '../types/storage.types.js';
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
     * Upload file to GCS with optional metadata
     */
    upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;
    /**
     * Generate presigned upload URL
     * @param fileName - The name of the file to upload (exact object name in GCS)
     * @param contentType - Content type constraint (defaults to 'application/octet-stream' if not provided)
     * @param fileSize - Exact file size in bytes (enforced via x-goog-content-length-range extension header)
     */
    generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate presigned view URL
     */
    generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    /**
     * Delete file from GCS
     * First verifies file exists, then deletes it
     */
    delete(fileName: string): Promise<boolean>;
    /**
     * Validate and confirm upload - verifies file exists and returns metadata
     */
    validateAndConfirmUpload(reference: string, _options?: BlobValidationOptions): Promise<BlobValidationResult>;
    /**
     * List files in GCS bucket with optional prefix and pagination
     */
    listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;
}
/**
 * Google Cloud Storage presigned driver
 */
export declare class GCSPresignedStorageDriver extends GCSStorageDriver {
    constructor(config: StorageConfig);
    /**
     * Override upload to return presigned URL instead of direct upload
     * Includes content type and file size constraints for validation
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
}
//# sourceMappingURL=gcs.driver.d.ts.map