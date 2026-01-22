import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig } from '../types/storage.types.js';
/**
 * Azure Blob Storage driver
 *
 * Supports two authentication methods:
 * 1. Connection string (recommended for simplicity)
 * 2. Account name + Account key (for more control)
 *
 * Also supports Azure Managed Identity when deployed on Azure (no credentials needed)
 */
export declare class AzureStorageDriver extends BaseStorageDriver {
    private blobServiceClient;
    private containerClient;
    private containerName;
    private accountName;
    private accountKey?;
    constructor(config: StorageConfig);
    /**
     * Upload file to Azure Blob Storage
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
    /**
     * Generate presigned upload URL (SAS URL)
     * @param fileName - Name of the file
     * @param contentType - Optional MIME type (Azure SAS doesn't enforce content type)
     * @param _maxSize - Optional max file size (Azure SAS doesn't support size limits)
     */
    generateUploadUrl(fileName: string, contentType?: string, _maxSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate presigned view URL (SAS URL)
     */
    generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    /**
     * Delete file from Azure Blob Storage
     */
    delete(fileName: string): Promise<boolean>;
}
/**
 * Azure Blob Storage presigned driver
 */
export declare class AzurePresignedStorageDriver extends AzureStorageDriver {
    constructor(config: StorageConfig);
    /**
     * Override upload to return presigned URL instead of direct upload
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
}
//# sourceMappingURL=azure.driver.d.ts.map