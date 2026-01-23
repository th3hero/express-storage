import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, ListFilesResult, UploadOptions } from '../types/storage.types.js';
/**
 * Local storage driver for file system storage
 */
export declare class LocalStorageDriver extends BaseStorageDriver {
    private basePath;
    constructor(config: StorageConfig);
    /**
     * Upload file to local storage
     * Note: Local storage ignores upload options (metadata, cacheControl, etc.)
     */
    upload(file: Express.Multer.File, _options?: UploadOptions): Promise<FileUploadResult>;
    /**
     * Generate URL for a file based on configured base path
     * Handles both public/ and custom storage paths
     */
    private generateFileUrl;
    /**
     * Normalize path separators to forward slashes (for URLs and cross-platform consistency)
     */
    private normalizePathSeparators;
    /**
     * Normalize URL by removing duplicate slashes
     */
    private normalizeUrl;
    /**
     * Generate upload URL (not supported for local storage)
     */
    generateUploadUrl(_fileName: string, _contentType?: string, _maxSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate view URL (not supported for local storage)
     */
    generateViewUrl(_fileName: string): Promise<PresignedUrlResult>;
    /**
     * Delete file from local storage
     * @param reference - Can be just filename or relative path (e.g., 'january/2026/file.jpg')
     */
    delete(reference: string): Promise<boolean>;
    /**
     * Resolve file path from reference
     * Handles both full relative paths and just filenames
     */
    private resolveFilePath;
    /**
     * Find file by name searching through directories
     */
    private findFileByName;
    /**
     * List files in local storage with optional prefix filter and pagination
     * @param prefix - Filter files by prefix
     * @param maxResults - Maximum number of results per page
     * @param continuationToken - Filename to start after (for pagination)
     */
    listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;
}
//# sourceMappingURL=local.driver.d.ts.map