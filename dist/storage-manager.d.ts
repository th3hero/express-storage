import { FileUploadResult, PresignedUrlResult, FileInput, StorageConfig, StorageOptions, FileValidationOptions, StorageDriver } from './types/storage.types.js';
/**
 * Main storage manager class
 *
 * @example
 * // Initialize with options
 * const storage = new StorageManager({
 *   driver: 's3',
 *   credentials: {
 *     bucketName: 'my-bucket',
 *     awsRegion: 'us-east-1',
 *     awsAccessKey: 'xxx',
 *     awsSecretKey: 'xxx'
 *   }
 * });
 *
 * // Or use environment variables
 * const storage = new StorageManager({ driver: 'local' });
 */
export declare class StorageManager {
    private driver;
    private config;
    constructor(options?: StorageOptions);
    /**
     * Build internal config from options or environment
     */
    private buildConfig;
    /**
     * Upload a single file with optional validation
     */
    uploadFile(file: Express.Multer.File, validation?: FileValidationOptions): Promise<FileUploadResult>;
    /**
     * Upload multiple files with optional validation
     */
    uploadFiles(files: Express.Multer.File[], validation?: FileValidationOptions): Promise<FileUploadResult[]>;
    /**
     * Upload files with input type detection
     */
    upload(input: FileInput, validation?: FileValidationOptions): Promise<FileUploadResult | FileUploadResult[]>;
    /**
     * Generate presigned upload URL with optional constraints
     *
     * @param fileName - Name of the file to upload
     * @param contentType - Optional MIME type constraint (e.g., 'image/jpeg')
     * @param maxSize - Optional max file size in bytes
     */
    generateUploadUrl(fileName: string, contentType?: string, maxSize?: number): Promise<PresignedUrlResult>;
    /**
     * Generate presigned view URL
     */
    generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    /**
     * Generate multiple upload URLs
     */
    generateUploadUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
    /**
     * Generate multiple view URLs
     */
    generateViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
    /**
     * Delete a single file
     */
    deleteFile(fileName: string): Promise<boolean>;
    /**
     * Delete multiple files
     */
    deleteFiles(fileNames: string[]): Promise<boolean[]>;
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