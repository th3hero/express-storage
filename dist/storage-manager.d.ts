import { FileUploadResult, DeleteResult, PresignedUrlResult, FileInput, StorageConfig, StorageOptions, FileValidationOptions, StorageDriver, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileMetadata } from './types/storage.types.js';
export declare class StorageManager {
    private driver;
    private config;
    private logger;
    constructor(options?: StorageOptions);
    /**
     * Build internal config from options or environment
     */
    private buildConfig;
    /**
     * Upload a single file with optional validation and metadata
     *
     * @param file - Multer file object
     * @param validation - Optional validation rules (maxSize, allowedMimeTypes, allowedExtensions)
     * @param uploadOptions - Optional upload settings (metadata, cacheControl, contentDisposition)
     *
     * @example
     * // Basic upload
     * const result = await storage.uploadFile(file);
     *
     * // With validation
     * const result = await storage.uploadFile(file, { maxSize: 5 * 1024 * 1024 });
     *
     * // With metadata
     * const result = await storage.uploadFile(file, undefined, {
     *   metadata: { uploadedBy: 'user123' },
     *   cacheControl: 'max-age=31536000'
     * });
     */
    uploadFile(file: Express.Multer.File, validation?: FileValidationOptions, uploadOptions?: UploadOptions): Promise<FileUploadResult>;
    /**
     * Upload multiple files with optional validation and metadata
     * Returns individual results for each file, including which specific files failed validation
     */
    uploadFiles(files: Express.Multer.File[], validation?: FileValidationOptions, uploadOptions?: UploadOptions): Promise<FileUploadResult[]>;
    /**
     * Upload files with input type detection
     */
    upload(input: FileInput, validation?: FileValidationOptions, uploadOptions?: UploadOptions): Promise<FileUploadResult | FileUploadResult[]>;
    /**
     * Generate presigned upload URL with file constraints
     *
     * The presigned URL will be restricted to accept only:
     * - The exact filename (transformed with timestamp prefix)
     * - The exact content type (if provided)
     * - The exact file size (enforced in S3/GCS, informational for Azure)
     *
     * @param fileName - Original name of the file to upload (will be transformed to unique name)
     * @param contentType - MIME type of the file (e.g., 'image/jpeg') - required for strict enforcement
     * @param fileSize - Exact file size in bytes - enforced in S3/GCS, informational for Azure
     * @param folder - Optional folder path to override default BUCKET_PATH (e.g., 'users/123')
     *
     * @example
     * // With BUCKET_PATH=uploads (default folder)
     * await storage.generateUploadUrl('photo.jpg', 'image/jpeg', 12345);
     * // Result: { fileName: '1769107318637_photo.jpg', filePath: 'uploads', reference: 'uploads/1769107318637_photo.jpg' }
     *
     * // Override with custom folder
     * await storage.generateUploadUrl('photo.jpg', 'image/jpeg', 12345, 'users/123');
     * // Result: { fileName: '1769107318637_photo.jpg', filePath: 'users/123', reference: 'users/123/1769107318637_photo.jpg' }
     */
    generateUploadUrl(fileName: string, contentType?: string, fileSize?: number, folder?: string): Promise<PresignedUrlResult>;
    /**
     * Build file path with optional folder prefix
     * Normalizes folder path (removes leading/trailing slashes)
     * Note: Folder should be validated with validateFolderPath() before calling this
     */
    private buildFilePath;
    /**
     * Validate folder path for security issues
     * Returns error message if invalid, null if valid
     */
    private validateFolderPath;
    /**
     * Validate MIME type format
     */
    private isValidMimeType;
    /**
     * Format bytes to human readable string
     */
    private formatBytes;
    /**
     * Generate presigned view URL
     * @param reference - Full path reference returned from generateUploadUrl (e.g., 'users/123/1769107318637_photo.jpg')
     */
    generateViewUrl(reference: string): Promise<PresignedUrlResult>;
    /**
     * Validate and confirm upload
     *
     * For S3/GCS: Simply verifies file exists (validation happens at URL level)
     * For Azure: Validates actual blob properties against expected values and deletes if invalid
     *
     * @param reference - Full path reference returned from generateUploadUrl
     * @param options - Expected content type and file size (required for Azure validation)
     *
     * @example
     * // For Azure - validates blob properties
     * const result = await storage.validateAndConfirmUpload(
     *   'uploads/1769107318637_photo.jpg',
     *   { expectedContentType: 'image/jpeg', expectedFileSize: 5000 }
     * );
     *
     * // For S3/GCS - just confirms file exists
     * const result = await storage.validateAndConfirmUpload('uploads/1769107318637_photo.jpg');
     */
    validateAndConfirmUpload(reference: string, options?: BlobValidationOptions): Promise<BlobValidationResult>;
    /**
     * Check if current driver requires post-upload validation
     * Returns true for Azure, false for S3/GCS
     */
    requiresPostUploadValidation(): boolean;
    /**
     * Generate multiple upload URLs with optional constraints
     *
     * @param files - Array of file metadata objects or simple file names
     * @param folder - Optional folder path to override default BUCKET_PATH
     *
     * @example
     * // Simple usage with just file names (no constraints)
     * const results = await storage.generateUploadUrls(['photo1.jpg', 'photo2.jpg']);
     *
     * // With full constraints
     * const results = await storage.generateUploadUrls([
     *   { fileName: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 12345 },
     *   { fileName: 'doc.pdf', contentType: 'application/pdf', fileSize: 54321 }
     * ]);
     */
    generateUploadUrls(files: (string | FileMetadata)[], folder?: string): Promise<PresignedUrlResult[]>;
    /**
     * Generate multiple view URLs
     * @param references - Array of full path references returned from generateUploadUrl
     */
    generateViewUrls(references: string[]): Promise<PresignedUrlResult[]>;
    /**
     * Delete a single file
     * @param reference - Full path reference returned from generateUploadUrl (e.g., 'users/123/1769107318637_photo.jpg')
     */
    deleteFile(reference: string): Promise<boolean>;
    /**
     * Delete multiple files
     * Returns detailed results including error messages for failed deletions
     * @param references - Array of full path references
     */
    deleteFiles(references: string[]): Promise<DeleteResult[]>;
    /**
     * List files with optional prefix and pagination
     *
     * @param prefix - Optional prefix to filter files (e.g., 'uploads/' or 'users/123/')
     * @param maxResults - Maximum number of results to return (default: 1000)
     * @param continuationToken - Token for pagination (from previous response's nextToken)
     *
     * @example
     * // List all files
     * const result = await storage.listFiles();
     *
     * // List files with prefix
     * const result = await storage.listFiles('uploads/2026/');
     *
     * // Paginate through results
     * let result = await storage.listFiles(undefined, 100);
     * while (result.nextToken) {
     *   result = await storage.listFiles(undefined, 100, result.nextToken);
     * }
     */
    listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;
    /**
     * Get current configuration
     */
    getConfig(): StorageConfig;
    /**
     * Get current driver type
     */
    getDriverType(): StorageDriver;
    /**
     * Check if presigned URLs are supported
     */
    isPresignedSupported(): boolean;
    /**
     * Get available drivers
     */
    static getAvailableDrivers(): StorageDriver[];
    /**
     * Clear driver cache
     */
    static clearCache(): void;
    /**
     * Validate file against options
     */
    private validateFile;
}
//# sourceMappingURL=storage-manager.d.ts.map