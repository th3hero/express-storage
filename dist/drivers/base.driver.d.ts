import { IStorageDriver, FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileMetadata, DeleteResult } from '../types/storage.types.js';
/**
 * Abstract base class for all storage drivers
 */
export declare abstract class BaseStorageDriver implements IStorageDriver {
    protected config: StorageConfig;
    constructor(config: StorageConfig);
    /**
     * Upload a single file with optional metadata
     */
    abstract upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;
    /**
     * Upload multiple files in parallel with optional metadata
     */
    uploadMultiple(files: Express.Multer.File[], options?: UploadOptions): Promise<FileUploadResult[]>;
    /**
     * Generate upload URL (for presigned drivers)
     * @param fileName - Name of the file (exact key/blob name)
     * @param contentType - MIME type constraint (enforced in signature)
     * @param fileSize - Exact file size in bytes (enforced in S3, informational for GCS/Azure)
     */
    abstract generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate view URL (for presigned drivers)
     */
    abstract generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    /**
     * Generate multiple upload URLs in parallel with optional constraints
     */
    generateMultipleUploadUrls(files: FileMetadata[]): Promise<PresignedUrlResult[]>;
    /**
     * Generate multiple view URLs in parallel
     */
    generateMultipleViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
    /**
     * Delete a single file
     */
    abstract delete(fileName: string): Promise<boolean>;
    /**
     * List files with optional prefix and pagination
     */
    abstract listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;
    /**
     * Delete multiple files in parallel
     * Returns detailed results including error messages for failed deletions
     */
    deleteMultiple(fileNames: string[]): Promise<DeleteResult[]>;
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
     * Supports both memory storage (buffer) and disk storage (path)
     */
    protected validateFile(file: Express.Multer.File): string[];
    /**
     * Get file content from either buffer (memory storage) or disk (disk storage)
     * Supports both Multer storage configurations
     */
    protected getFileContent(file: Express.Multer.File): Buffer;
    /**
     * Get presigned URL expiry time
     */
    protected getPresignedUrlExpiry(): number;
    /**
     * Validate and confirm upload (for Azure post-upload validation)
     * Default implementation just generates view URL (S3/GCS validate at URL level)
     * Azure overrides this to check blob properties
     */
    validateAndConfirmUpload(reference: string, _options?: BlobValidationOptions): Promise<BlobValidationResult>;
}
//# sourceMappingURL=base.driver.d.ts.map