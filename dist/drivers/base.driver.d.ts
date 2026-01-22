import { IStorageDriver, FileUploadResult, PresignedUrlResult, StorageConfig } from '../types/storage.types.js';
/**
 * Abstract base class for all storage drivers
 */
export declare abstract class BaseStorageDriver implements IStorageDriver {
    protected config: StorageConfig;
    constructor(config: StorageConfig);
    /**
     * Upload a single file
     */
    abstract upload(file: Express.Multer.File): Promise<FileUploadResult>;
    /**
     * Upload multiple files
     */
    uploadMultiple(files: Express.Multer.File[]): Promise<FileUploadResult[]>;
    /**
     * Generate upload URL (for presigned drivers)
     * @param fileName - Name of the file
     * @param contentType - Optional MIME type constraint
     * @param maxSize - Optional max file size in bytes
     */
    abstract generateUploadUrl(fileName: string, contentType?: string, maxSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate view URL (for presigned drivers)
     */
    abstract generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    /**
     * Generate multiple upload URLs
     */
    generateMultipleUploadUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
    /**
     * Generate multiple view URLs
     */
    generateMultipleViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
    /**
     * Delete a single file
     */
    abstract delete(fileName: string): Promise<boolean>;
    /**
     * Delete multiple files
     */
    deleteMultiple(fileNames: string[]): Promise<boolean[]>;
    /**
     * Generate unique filename with timestamp
     */
    protected generateFileName(originalName: string): string;
    /**
     * Create success result
     */
    protected createSuccessResult(fileName: string, fileUrl?: string): FileUploadResult;
    /**
     * Create error result
     */
    protected createErrorResult(error: string): FileUploadResult;
    /**
     * Create presigned success result
     */
    protected createPresignedSuccessResult(uploadUrl?: string, viewUrl?: string): PresignedUrlResult;
    /**
     * Create presigned error result
     */
    protected createPresignedErrorResult(error: string): PresignedUrlResult;
    /**
     * Validate file before upload
     */
    protected validateFile(file: Express.Multer.File): string[];
    /**
     * Get presigned URL expiry time
     */
    protected getPresignedUrlExpiry(): number;
}
//# sourceMappingURL=base.driver.d.ts.map