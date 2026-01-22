import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig } from '../types/storage.types.js';
/**
 * Local storage driver for file system storage
 */
export declare class LocalStorageDriver extends BaseStorageDriver {
    private basePath;
    constructor(config: StorageConfig);
    /**
     * Upload file to local storage
     */
    upload(file: Express.Multer.File): Promise<FileUploadResult>;
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
     */
    delete(fileName: string): Promise<boolean>;
    /**
     * Find file path by searching through month directories
     */
    private findFilePath;
}
//# sourceMappingURL=local.driver.d.ts.map