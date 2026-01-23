import { StorageDriverFactory } from './factory/driver.factory.js';
import { validateStorageConfig } from './utils/config.utils.js';
import { getFileExtension, generateUniqueFileName, validateFileName } from './utils/file.utils.js';
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
// No-op logger for when logging is disabled
const noopLogger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};
export class StorageManager {
    constructor(options) {
        // Set up logger (use provided logger or noop)
        this.logger = options?.logger || noopLogger;
        // Convert options to internal config format
        this.config = this.buildConfig(options);
        this.logger.debug('StorageManager initializing', { driver: this.config.driver });
        // Validate configuration
        const validation = validateStorageConfig(this.config);
        if (!validation.isValid) {
            this.logger.error('Configuration validation failed', { errors: validation.errors });
            throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
        }
        // Create driver
        this.driver = StorageDriverFactory.createDriver(this.config);
        this.logger.info('StorageManager initialized', { driver: this.config.driver });
    }
    /**
     * Build internal config from options or environment
     */
    buildConfig(options) {
        const driver = options?.driver || process.env['FILE_DRIVER'] || 'local';
        const creds = options?.credentials || {};
        return {
            driver,
            bucketName: creds.bucketName || process.env['BUCKET_NAME'],
            bucketPath: creds.bucketPath || process.env['BUCKET_PATH'] || '', // Default to root
            localPath: creds.localPath || process.env['LOCAL_PATH'] || 'public/express-storage',
            presignedUrlExpiry: creds.presignedUrlExpiry ||
                (process.env['PRESIGNED_URL_EXPIRY'] ? parseInt(process.env['PRESIGNED_URL_EXPIRY'], 10) : 600),
            maxFileSize: creds.maxFileSize ||
                (process.env['MAX_FILE_SIZE'] ? parseInt(process.env['MAX_FILE_SIZE'], 10) : 5 * 1024 * 1024 * 1024), // Default 5GB
            // AWS S3
            awsRegion: creds.awsRegion || process.env['AWS_REGION'],
            awsAccessKey: creds.awsAccessKey || process.env['AWS_ACCESS_KEY'],
            awsSecretKey: creds.awsSecretKey || process.env['AWS_SECRET_KEY'],
            // GCS
            gcsProjectId: creds.gcsProjectId || process.env['GCS_PROJECT_ID'],
            gcsCredentials: creds.gcsCredentials || process.env['GCS_CREDENTIALS'],
            // Azure
            azureConnectionString: creds.azureConnectionString || process.env['AZURE_CONNECTION_STRING'],
            azureAccountName: creds.azureAccountName || process.env['AZURE_ACCOUNT_NAME'],
            azureAccountKey: creds.azureAccountKey || process.env['AZURE_ACCOUNT_KEY'],
            azureContainerName: creds.azureContainerName || process.env['AZURE_CONTAINER_NAME'],
        };
    }
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
    async uploadFile(file, validation, uploadOptions) {
        this.logger.debug('uploadFile called', {
            originalName: file.originalname,
            size: file.size,
            mimeType: file.mimetype
        });
        // Validate file if options provided
        if (validation) {
            const validationError = this.validateFile(file, validation);
            if (validationError) {
                this.logger.warn('File validation failed', { error: validationError });
                return { success: false, error: validationError };
            }
        }
        const result = await this.driver.upload(file, uploadOptions);
        if (result.success) {
            this.logger.info('File uploaded successfully', { fileName: result.fileName });
        }
        else {
            this.logger.error('File upload failed', { error: result.error });
        }
        return result;
    }
    /**
     * Upload multiple files with optional validation and metadata
     * Returns individual results for each file, including which specific files failed validation
     */
    async uploadFiles(files, validation, uploadOptions) {
        // Validate files and collect results
        const validationResults = [];
        if (validation) {
            for (const file of files) {
                const validationError = this.validateFile(file, validation);
                validationResults.push({ file, error: validationError });
            }
        }
        else {
            // No validation - all files pass
            for (const file of files) {
                validationResults.push({ file, error: null });
            }
        }
        // Separate valid and invalid files
        const validFiles = validationResults.filter(r => r.error === null).map(r => r.file);
        const results = [];
        // Upload valid files
        let uploadResults = [];
        if (validFiles.length > 0) {
            uploadResults = await this.driver.uploadMultiple(validFiles, uploadOptions);
        }
        // Build final results array maintaining original order
        let uploadIndex = 0;
        for (const { file, error } of validationResults) {
            if (error !== null) {
                // Validation failed for this file
                results.push({
                    success: false,
                    error: `File '${file.originalname}': ${error}`,
                });
            }
            else {
                // File was uploaded (or attempted)
                const uploadResult = uploadResults[uploadIndex++];
                if (uploadResult) {
                    results.push(uploadResult);
                }
                else {
                    results.push({
                        success: false,
                        error: `File '${file.originalname}': Upload result missing`,
                    });
                }
            }
        }
        return results;
    }
    /**
     * Upload files with input type detection
     */
    async upload(input, validation, uploadOptions) {
        if (input.type === 'single') {
            return this.uploadFile(input.file, validation, uploadOptions);
        }
        else {
            return this.uploadFiles(input.files, validation, uploadOptions);
        }
    }
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
    async generateUploadUrl(fileName, contentType, fileSize, folder) {
        // Validate filename
        const fileNameError = validateFileName(fileName);
        if (fileNameError) {
            return {
                success: false,
                error: fileNameError,
            };
        }
        // Validate fileSize if provided
        if (fileSize !== undefined) {
            if (fileSize <= 0) {
                return {
                    success: false,
                    error: 'fileSize must be a positive number',
                };
            }
            // Reject if fileSize exceeds configured max (default 5GB)
            const maxAllowedSize = this.config.maxFileSize || (5 * 1024 * 1024 * 1024);
            if (fileSize > maxAllowedSize) {
                return {
                    success: false,
                    error: `fileSize cannot exceed ${maxAllowedSize} bytes (${this.formatBytes(maxAllowedSize)})`,
                };
            }
        }
        // Validate contentType format if provided
        if (contentType && !this.isValidMimeType(contentType)) {
            return {
                success: false,
                error: `Invalid contentType format: '${contentType}'. Expected format: type/subtype (e.g., 'image/jpeg')`,
            };
        }
        // Generate unique filename with timestamp prefix
        const uniqueFileName = generateUniqueFileName(fileName);
        // Use provided folder, or fall back to default bucketPath from config
        const effectiveFolder = folder !== undefined ? folder : (this.config.bucketPath || '');
        // Validate folder path for security
        if (effectiveFolder) {
            const folderValidationError = this.validateFolderPath(effectiveFolder);
            if (folderValidationError) {
                return {
                    success: false,
                    error: folderValidationError,
                };
            }
        }
        // Build full reference path
        const reference = this.buildFilePath(uniqueFileName, effectiveFolder);
        const result = await this.driver.generateUploadUrl(reference, contentType, fileSize);
        if (result.success) {
            const response = {
                ...result,
                fileName: uniqueFileName, // Just the filename: "1769107318637_photo.jpg"
                reference, // Full path for view/delete: "users/123/1769107318637_photo.jpg"
                expiresIn: this.config.presignedUrlExpiry || 600,
            };
            // Only set filePath if there's a folder
            if (effectiveFolder) {
                response.filePath = effectiveFolder; // Folder path: "users/123"
            }
            if (contentType) {
                response.contentType = contentType;
            }
            if (fileSize) {
                response.fileSize = fileSize;
            }
            // Azure requires post-upload validation (doesn't enforce at URL level)
            if (this.config.driver === 'azure-presigned') {
                response.requiresValidation = true;
            }
            return response;
        }
        return result;
    }
    /**
     * Build file path with optional folder prefix
     * Normalizes folder path (removes leading/trailing slashes)
     * Note: Folder should be validated with validateFolderPath() before calling this
     */
    buildFilePath(fileName, folder) {
        if (!folder) {
            return fileName;
        }
        // Normalize folder path: remove leading/trailing slashes
        const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
        if (!normalizedFolder) {
            return fileName;
        }
        return `${normalizedFolder}/${fileName}`;
    }
    /**
     * Validate folder path for security issues
     * Returns error message if invalid, null if valid
     */
    validateFolderPath(folder) {
        // Check for path traversal attempts
        if (folder.includes('..')) {
            return 'Folder path cannot contain path traversal sequences (..)';
        }
        // Check for null bytes (can be used to bypass security)
        if (folder.includes('\0')) {
            return 'Folder path cannot contain null bytes';
        }
        // Check for invalid characters that could cause issues with cloud storage
        // Allow: alphanumeric, hyphens, underscores, forward slashes, dots (but not ..)
        const invalidCharsRegex = /[<>:"|?*\\]/;
        if (invalidCharsRegex.test(folder)) {
            return 'Folder path contains invalid characters. Avoid: < > : " | ? * \\';
        }
        // Check for consecutive slashes (could indicate issues)
        if (/\/{2,}/.test(folder)) {
            return 'Folder path cannot contain consecutive slashes';
        }
        return null;
    }
    /**
     * Validate MIME type format
     */
    isValidMimeType(mimeType) {
        // Basic MIME type validation: type/subtype format
        const mimeTypeRegex = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/;
        return mimeTypeRegex.test(mimeType);
    }
    /**
     * Format bytes to human readable string
     */
    formatBytes(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0)
            return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
    }
    /**
     * Generate presigned view URL
     * @param reference - Full path reference returned from generateUploadUrl (e.g., 'users/123/1769107318637_photo.jpg')
     */
    async generateViewUrl(reference) {
        const result = await this.driver.generateViewUrl(reference);
        if (result.success) {
            return {
                ...result,
                reference,
                expiresIn: this.config.presignedUrlExpiry || 600,
            };
        }
        return result;
    }
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
    async validateAndConfirmUpload(reference, options) {
        return this.driver.validateAndConfirmUpload(reference, options);
    }
    /**
     * Check if current driver requires post-upload validation
     * Returns true for Azure, false for S3/GCS
     */
    requiresPostUploadValidation() {
        return this.config.driver === 'azure-presigned';
    }
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
    async generateUploadUrls(files, folder) {
        // Use provided folder, or fall back to default bucketPath from config
        const effectiveFolder = folder !== undefined ? folder : (this.config.bucketPath || '');
        // Generate results for each file in parallel
        const promises = files.map(file => {
            if (typeof file === 'string') {
                // Simple string filename - no constraints
                return this.generateUploadUrl(file, undefined, undefined, effectiveFolder);
            }
            else {
                // FileMetadata object - with constraints
                return this.generateUploadUrl(file.fileName, file.contentType, file.fileSize, effectiveFolder);
            }
        });
        return Promise.all(promises);
    }
    /**
     * Generate multiple view URLs
     * @param references - Array of full path references returned from generateUploadUrl
     */
    async generateViewUrls(references) {
        return this.driver.generateMultipleViewUrls(references);
    }
    /**
     * Delete a single file
     * @param reference - Full path reference returned from generateUploadUrl (e.g., 'users/123/1769107318637_photo.jpg')
     */
    async deleteFile(reference) {
        this.logger.debug('deleteFile called', { reference });
        const result = await this.driver.delete(reference);
        if (result) {
            this.logger.info('File deleted successfully', { reference });
        }
        else {
            this.logger.warn('File deletion failed or file not found', { reference });
        }
        return result;
    }
    /**
     * Delete multiple files
     * Returns detailed results including error messages for failed deletions
     * @param references - Array of full path references
     */
    async deleteFiles(references) {
        return this.driver.deleteMultiple(references);
    }
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
    async listFiles(prefix, maxResults, continuationToken) {
        return this.driver.listFiles(prefix, maxResults, continuationToken);
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Get current driver type
     */
    getDriverType() {
        return this.config.driver;
    }
    /**
     * Check if presigned URLs are supported
     */
    isPresignedSupported() {
        return this.config.driver.includes('-presigned');
    }
    /**
     * Get available drivers
     */
    static getAvailableDrivers() {
        return StorageDriverFactory.getAvailableDrivers();
    }
    /**
     * Clear driver cache
     */
    static clearCache() {
        StorageDriverFactory.clearCache();
    }
    /**
     * Validate file against options
     */
    validateFile(file, options) {
        // Check max size
        if (options.maxSize && file.size > options.maxSize) {
            return `File size ${file.size} exceeds maximum allowed size of ${options.maxSize} bytes`;
        }
        // Check MIME type
        if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
            if (!options.allowedMimeTypes.includes(file.mimetype)) {
                return `File type '${file.mimetype}' is not allowed. Allowed types: ${options.allowedMimeTypes.join(', ')}`;
            }
        }
        // Check extension
        if (options.allowedExtensions && options.allowedExtensions.length > 0) {
            const ext = getFileExtension(file.originalname).toLowerCase();
            const normalizedExtensions = options.allowedExtensions.map(e => e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`);
            if (!normalizedExtensions.includes(ext)) {
                return `File extension '${ext}' is not allowed. Allowed extensions: ${options.allowedExtensions.join(', ')}`;
            }
        }
        return null;
    }
}
//# sourceMappingURL=storage-manager.js.map