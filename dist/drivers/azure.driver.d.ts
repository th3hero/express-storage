import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions } from '../types/storage.types.js';
/**
 * Azure Blob Storage driver
 *
 * Supports three authentication methods:
 * 1. Connection string (recommended for simplicity)
 * 2. Account name + Account key (for more control)
 * 3. Default Azure Credentials / Managed Identity (for Azure-hosted apps)
 *
 * Note: SAS URL generation requires account key (options 1 or 2).
 * Managed Identity (option 3) supports direct upload/download but not presigned URLs.
 */
export declare class AzureStorageDriver extends BaseStorageDriver {
    private blobServiceClient;
    private containerClient;
    private containerName;
    private accountName;
    private accountKey?;
    constructor(config: StorageConfig);
    /**
     * Upload file to Azure Blob Storage with optional metadata
     */
    upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;
    /**
     * Generate presigned upload URL (SAS URL)
     * @param fileName - Name of the file
     * @param contentType - MIME type (defaults to 'application/octet-stream' if not provided)
     * @param _fileSize - File size in bytes (Azure SAS doesn't support size enforcement - informational only)
     */
    generateUploadUrl(fileName: string, contentType?: string, _fileSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate presigned view URL (SAS URL)
     */
    generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    /**
     * Delete file from Azure Blob Storage
     * First verifies file exists, then deletes it
     */
    delete(fileName: string): Promise<boolean>;
    /**
     * Validate and confirm upload - Azure-specific implementation
     * Checks actual blob properties against expected values
     * Deletes blob if validation fails
     */
    validateAndConfirmUpload(reference: string, options?: BlobValidationOptions): Promise<BlobValidationResult>;
    /**
     * List files in Azure container with optional prefix and pagination
     */
    listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;
}
/**
 * Azure Blob Storage presigned driver
 * Requires account key for SAS URL generation (Managed Identity is not supported)
 */
export declare class AzurePresignedStorageDriver extends AzureStorageDriver {
    constructor(config: StorageConfig);
    /**
     * Check if account key is available for SAS generation
     */
    private hasAccountKey;
    /**
     * Override upload to return presigned URL instead of direct upload
     * Note: Azure SAS URLs don't enforce content type or file size at URL level
     * Use validateAndConfirmUpload() after upload for validation
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
}
//# sourceMappingURL=azure.driver.d.ts.map