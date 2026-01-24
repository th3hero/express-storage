import { 
  IStorageDriver, 
  FileUploadResult, 
  DeleteResult,
  PresignedUrlResult, 
  FileInput, 
  StorageConfig,
  StorageOptions,
  FileValidationOptions,
  StorageDriver,
  BlobValidationOptions,
  BlobValidationResult,
  ListFilesResult,
  UploadOptions,
  FileMetadata,
  Logger,
  RateLimitOptions
} from './types/storage.types.js';
import { StorageDriverFactory } from './factory/driver.factory.js';
import { validateStorageConfig, loadEnvironmentConfig, environmentToStorageConfig } from './utils/config.utils.js';
import { getFileExtension, generateUniqueFileName, validateFileName, withConcurrencyLimit, formatFileSize } from './utils/file.utils.js';

/**
 * Simple sliding window rate limiter for presigned URL generation.
 * Tracks request timestamps and rejects requests that exceed the limit.
 */
class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(options: RateLimitOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs || 60000; // Default: 1 minute
  }

  /**
   * Check if a request is allowed and record it if so.
   * @returns true if allowed, false if rate limited
   */
  tryAcquire(): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Remove expired entries (outside the window)
    this.requests = this.requests.filter(timestamp => timestamp > windowStart);
    
    // Check if we're at the limit
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    // Record this request
    this.requests.push(now);
    return true;
  }

  /**
   * Get the number of remaining requests in the current window.
   */
  getRemainingRequests(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.requests = this.requests.filter(timestamp => timestamp > windowStart);
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  /**
   * Get the time until the rate limit resets (in ms).
   */
  getResetTime(): number {
    if (this.requests.length === 0) {
      return 0;
    }
    const oldestRequest = Math.min(...this.requests);
    const resetTime = oldestRequest + this.windowMs - Date.now();
    return Math.max(0, resetTime);
  }
}

/**
 * StorageManager - Your single point of contact for all file operations.
 * 
 * Think of it as a universal remote that works with any storage provider.
 * You don't need to know the specifics of S3, GCS, Azure, or local storage —
 * just tell StorageManager what you want to do and it handles the rest.
 * 
 * @example
 * // The simplest setup - just reads from your .env file
 * const storage = new StorageManager();
 * 
 * // Or configure it yourself
 * const storage = new StorageManager({
 *   driver: 's3',
 *   credentials: {
 *     bucketName: 'my-bucket',
 *     awsRegion: 'us-east-1'
 *   }
 * });
 */

// Silent logger when no custom logger is provided
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class StorageManager {
  private driver: IStorageDriver;
  private config: StorageConfig;
  private logger: Logger;
  private rateLimiter: RateLimiter | null = null;

  constructor(options?: StorageOptions) {
    this.logger = options?.logger || noopLogger;
    this.config = this.buildConfig(options);
    
    // Initialize rate limiter if configured
    if (options?.rateLimit) {
      this.rateLimiter = new RateLimiter(options.rateLimit);
      this.logger.debug('Rate limiting enabled', { 
        maxRequests: options.rateLimit.maxRequests,
        windowMs: options.rateLimit.windowMs || 60000
      });
    }
    
    this.logger.debug('StorageManager initializing', { driver: this.config.driver });
    
    // Make sure the configuration makes sense before proceeding
    const validation = validateStorageConfig(this.config);
    if (!validation.isValid) {
      this.logger.error('Configuration validation failed', { errors: validation.errors });
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
    
    this.driver = StorageDriverFactory.createDriver(this.config);
    this.logger.info('StorageManager initialized', { driver: this.config.driver });
  }

  /**
   * Builds the final configuration by merging environment variables with any
   * options you passed in. Your explicit options always win over env vars.
   */
  private buildConfig(options?: StorageOptions): StorageConfig {
    const envConfig = loadEnvironmentConfig();
    const baseConfig = environmentToStorageConfig(envConfig);
    
    if (!options) {
      return {
        ...baseConfig,
        driver: baseConfig.driver || 'local',
        maxFileSize: baseConfig.maxFileSize || 5 * 1024 * 1024 * 1024,
      };
    }
    
    const creds = options.credentials || {};
    
    // Use nullish coalescing (??) for numeric values to allow explicit 0 values
    // Using || would treat 0 as falsy and override with defaults
    return {
      driver: options.driver || baseConfig.driver || 'local',
      bucketName: creds.bucketName || baseConfig.bucketName,
      bucketPath: creds.bucketPath ?? baseConfig.bucketPath ?? '',
      localPath: creds.localPath || baseConfig.localPath || 'public/express-storage',
      presignedUrlExpiry: creds.presignedUrlExpiry ?? baseConfig.presignedUrlExpiry ?? 600,
      maxFileSize: creds.maxFileSize ?? baseConfig.maxFileSize ?? 5 * 1024 * 1024 * 1024,
      
      awsRegion: creds.awsRegion || baseConfig.awsRegion,
      awsAccessKey: creds.awsAccessKey || baseConfig.awsAccessKey,
      awsSecretKey: creds.awsSecretKey || baseConfig.awsSecretKey,
      
      gcsProjectId: creds.gcsProjectId || baseConfig.gcsProjectId,
      gcsCredentials: creds.gcsCredentials || baseConfig.gcsCredentials,
      
      azureConnectionString: creds.azureConnectionString || baseConfig.azureConnectionString,
      azureAccountName: creds.azureAccountName || baseConfig.azureAccountName,
      azureAccountKey: creds.azureAccountKey || baseConfig.azureAccountKey,
      azureContainerName: creds.azureContainerName || baseConfig.azureContainerName,
    };
  }

  /**
   * Uploads a single file to your configured storage.
   * 
   * This is the method you'll use most often. It handles everything:
   * validation, unique naming, and the actual upload.
   * 
   * @param file - The file from Multer (req.file)
   * @param validation - Optional rules like max size and allowed types
   * @param uploadOptions - Optional metadata, cache headers, etc.
   * 
   * @example
   * // Simple upload
   * const result = await storage.uploadFile(req.file);
   * 
   * // With validation (reject files over 5MB or wrong type)
   * const result = await storage.uploadFile(req.file, {
   *   maxSize: 5 * 1024 * 1024,
   *   allowedMimeTypes: ['image/jpeg', 'image/png']
   * });
   * 
   * // With custom metadata
   * const result = await storage.uploadFile(req.file, undefined, {
   *   metadata: { uploadedBy: 'user123' },
   *   cacheControl: 'max-age=31536000'
   * });
   */
  async uploadFile(
    file: Express.Multer.File, 
    validation?: FileValidationOptions,
    uploadOptions?: UploadOptions
  ): Promise<FileUploadResult> {
    if (!file) {
      this.logger.warn('uploadFile called with null/undefined file');
      return { success: false, error: 'No file provided' };
    }

    this.logger.debug('uploadFile called', { 
      originalName: file.originalname, 
      size: file.size, 
      mimeType: file.mimetype 
    });

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
    } else {
      this.logger.error('File upload failed', { error: result.error });
    }
    
    return result;
  }

  /**
   * Uploads multiple files at once.
   * 
   * Files are processed in parallel (up to 10 at a time) for speed,
   * but each file gets its own result — so one failure doesn't stop the others.
   */
  async uploadFiles(
    files: Express.Multer.File[], 
    validation?: FileValidationOptions,
    uploadOptions?: UploadOptions
  ): Promise<FileUploadResult[]> {
    if (!files || files.length === 0) {
      return [];
    }
    
    return withConcurrencyLimit(
      files,
      async (file): Promise<FileUploadResult> => {
        if (validation) {
          const validationError = this.validateFile(file, validation);
          if (validationError) {
            return {
              success: false,
              error: `File '${file.originalname || 'unknown'}': ${validationError}`,
            };
          }
        }
        
        try {
          return await this.driver.upload(file, uploadOptions);
        } catch (error) {
          return {
            success: false,
            error: `File '${file.originalname}': ${error instanceof Error ? error.message : 'Failed to upload file'}`,
          };
        }
      },
      { maxConcurrent: 10 }
    );
  }

  /**
   * Smart upload that handles both single files and arrays.
   * Pass in what you have and it figures out the rest.
   */
  async upload(
    input: FileInput, 
    validation?: FileValidationOptions,
    uploadOptions?: UploadOptions
  ): Promise<FileUploadResult | FileUploadResult[]> {
    if (input.type === 'single') {
      return this.uploadFile(input.file, validation, uploadOptions);
    } else {
      return this.uploadFiles(input.files, validation, uploadOptions);
    }
  }

  /**
   * Creates a presigned URL that lets clients upload directly to cloud storage.
   * 
   * This is powerful for large files — the upload goes straight to S3/GCS/Azure
   * without passing through your server, saving bandwidth and processing time.
   * 
   * The URL is time-limited and (for S3/GCS) locked to specific file constraints.
   * 
   * Rate limiting: If you configured `rateLimit` in StorageOptions, this method
   * will reject requests that exceed the limit with an error.
   * 
   * @param fileName - What the user wants to call their file
   * @param contentType - The MIME type (e.g., 'image/jpeg')
   * @param fileSize - Exact size in bytes (enforced by S3/GCS, advisory for Azure)
   * @param folder - Where to put the file (overrides your default BUCKET_PATH)
   * 
   * @example
   * const result = await storage.generateUploadUrl('photo.jpg', 'image/jpeg', 12345);
   * // Give result.uploadUrl to your frontend
   * // Save result.reference — you'll need it to view or delete the file later
   */
  async generateUploadUrl(
    fileName: string, 
    contentType?: string, 
    fileSize?: number,
    folder?: string
  ): Promise<PresignedUrlResult> {
    // Check rate limit if configured
    if (this.rateLimiter && !this.rateLimiter.tryAcquire()) {
      const resetTime = this.rateLimiter.getResetTime();
      this.logger.warn('Rate limit exceeded for presigned URL generation', { resetTimeMs: resetTime });
      return {
        success: false,
        error: `Rate limit exceeded. Try again in ${Math.ceil(resetTime / 1000)} seconds.`,
      };
    }
    
    // Make sure the filename is safe
    const fileNameError = validateFileName(fileName);
    if (fileNameError) {
      return { success: false, error: fileNameError };
    }

    // Validate file size if provided
    // Allow fileSize of 0 for empty/placeholder files (e.g., .gitkeep, lock files)
    if (fileSize !== undefined) {
      if (typeof fileSize !== 'number' || Number.isNaN(fileSize) || fileSize < 0) {
        return { success: false, error: 'fileSize must be a non-negative number' };
      }
      
      const defaultMaxSize = 5 * 1024 * 1024 * 1024;
      const maxAllowedSize = this.config.maxFileSize ?? defaultMaxSize;
      const effectiveMaxSize = maxAllowedSize > 0 ? maxAllowedSize : defaultMaxSize;
      
      if (fileSize > effectiveMaxSize) {
        return {
          success: false,
          error: `fileSize cannot exceed ${effectiveMaxSize} bytes (${this.formatBytes(effectiveMaxSize)})`,
        };
      }
    }

    // Make sure content type looks valid
    if (contentType && !this.isValidMimeType(contentType)) {
      return {
        success: false,
        error: `Invalid contentType format: '${contentType}'. Expected format: type/subtype (e.g., 'image/jpeg')`,
      };
    }

    // Create a unique filename to prevent overwrites
    const uniqueFileName = generateUniqueFileName(fileName);
    const effectiveFolder = folder !== undefined ? folder : (this.config.bucketPath || '');
    
    // Security check on the folder path
    if (effectiveFolder) {
      const folderValidationError = this.validateFolderPath(effectiveFolder);
      if (folderValidationError) {
        return { success: false, error: folderValidationError };
      }
    }
    
    const reference = this.buildFilePath(uniqueFileName, effectiveFolder);
    const result = await this.driver.generateUploadUrl(reference, contentType, fileSize);
    
    if (result.success) {
      const response: PresignedUrlResult = {
        ...result,
        fileName: uniqueFileName,
        reference,
        expiresIn: this.config.presignedUrlExpiry || 600,
      };
      
      if (effectiveFolder) {
        response.filePath = effectiveFolder;
      }
      if (contentType) {
        response.contentType = contentType;
      }
      if (fileSize !== undefined) {
        response.fileSize = fileSize;
      }
      // Azure doesn't enforce constraints at the URL level
      if (this.config.driver === 'azure-presigned') {
        response.requiresValidation = true;
      }
      return response;
    }
    
    return result;
  }

  /**
   * Combines folder and filename into a full path.
   * Handles edge cases like leading/trailing slashes.
   */
  private buildFilePath(fileName: string, folder?: string): string {
    if (!folder) {
      return fileName;
    }
    
    const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
    if (!normalizedFolder) {
      return fileName;
    }
    
    return `${normalizedFolder}/${fileName}`;
  }

  /**
   * Checks folder paths for security issues.
   * Blocks path traversal attempts and other sneaky tricks.
   */
  private validateFolderPath(folder: string): string | null {
    if (folder.includes('..')) {
      return 'Folder path cannot contain path traversal sequences (..)';
    }
    
    if (folder.includes('\0')) {
      return 'Folder path cannot contain null bytes';
    }
    
    const invalidCharsRegex = /[<>:"|?*\\;$`']/;
    if (invalidCharsRegex.test(folder)) {
      return "Folder path contains invalid characters. Avoid: < > : \" | ? * \\ ; $ ` '";
    }
    
    if (/\/{2,}/.test(folder)) {
      return 'Folder path cannot contain consecutive slashes';
    }
    
    return null;
  }

  /**
   * Checks if a string looks like a valid MIME type.
   */
  private isValidMimeType(mimeType: string): boolean {
    const mimeTypeRegex = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/;
    return mimeTypeRegex.test(mimeType);
  }

  /**
   * Converts bytes to a human-readable string like "5.2 MB".
   */
  private formatBytes(bytes: number): string {
    return formatFileSize(bytes);
  }

  /**
   * Creates a presigned URL for viewing/downloading an existing file.
   * 
   * Rate limiting: If configured, this counts toward the presigned URL rate limit.
   * 
   * @param reference - The full path you got from generateUploadUrl
   */
  async generateViewUrl(reference: string): Promise<PresignedUrlResult> {
    // Check rate limit if configured
    if (this.rateLimiter && !this.rateLimiter.tryAcquire()) {
      const resetTime = this.rateLimiter.getResetTime();
      this.logger.warn('Rate limit exceeded for presigned URL generation', { resetTimeMs: resetTime });
      return {
        success: false,
        error: `Rate limit exceeded. Try again in ${Math.ceil(resetTime / 1000)} seconds.`,
      };
    }
    if (reference.includes('..') || reference.includes('\0')) {
      return {
        success: false,
        error: 'Invalid reference: path traversal sequences are not allowed',
      };
    }
    
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
   * Verifies that a presigned upload actually happened and the file is valid.
   * 
   * For Azure, this is essential — Azure doesn't enforce file constraints at
   * the URL level, so we check the actual blob properties here.
   * 
   * For S3/GCS, this confirms the file exists and optionally validates it.
   * 
   * @param reference - The file path from generateUploadUrl
   * @param options - Expected content type and size to validate against
   * 
   * @example
   * // After the client uploads, verify everything looks right
   * const result = await storage.validateAndConfirmUpload(reference, {
   *   expectedContentType: 'image/jpeg',
   *   expectedFileSize: 12345
   * });
   */
  async validateAndConfirmUpload(
    reference: string,
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    if (reference.includes('..') || reference.includes('\0')) {
      return {
        success: false,
        error: 'Invalid reference: path traversal sequences are not allowed',
      };
    }
    
    return this.driver.validateAndConfirmUpload(reference, options);
  }

  /**
   * Returns true if you're using Azure presigned mode.
   * 
   * This is your hint that you MUST call validateAndConfirmUpload()
   * after presigned uploads — Azure doesn't enforce constraints otherwise.
   */
  requiresPostUploadValidation(): boolean {
    return this.config.driver === 'azure-presigned';
  }

  /**
   * Creates presigned upload URLs for multiple files at once.
   * Great for batch uploads or when letting users select multiple files.
   * 
   * @param files - Array of filenames (strings) or file metadata objects
   * @param folder - Optional folder to put all files in
   */
  async generateUploadUrls(
    files: (string | FileMetadata)[],
    folder?: string
  ): Promise<PresignedUrlResult[]> {
    if (!files || files.length === 0) {
      return [];
    }

    const effectiveFolder = folder !== undefined ? folder : (this.config.bucketPath || '');
    
    return withConcurrencyLimit(
      files,
      async (file): Promise<PresignedUrlResult> => {
        if (file === null || file === undefined) {
          return {
            success: false,
            error: 'Invalid input: file entry cannot be null or undefined',
          };
        }
        
        if (typeof file === 'string') {
          return this.generateUploadUrl(file, undefined, undefined, effectiveFolder);
        }
        
        if (typeof file !== 'object') {
          return {
            success: false,
            error: `Invalid input type: expected string or FileMetadata object, got ${typeof file}`,
          };
        }
        
        if (!file.fileName || typeof file.fileName !== 'string') {
          return {
            success: false,
            error: 'FileMetadata must have a valid fileName property',
          };
        }
        
        return this.generateUploadUrl(
          file.fileName,
          file.contentType,
          file.fileSize,
          effectiveFolder
        );
      },
      { maxConcurrent: 10 }
    );
  }

  /**
   * Creates presigned view URLs for multiple files at once.
   * Useful when displaying a gallery or list of downloadable files.
   */
  async generateViewUrls(references: string[]): Promise<PresignedUrlResult[]> {
    if (!references || references.length === 0) {
      return [];
    }

    return withConcurrencyLimit(
      references,
      async (reference): Promise<PresignedUrlResult> => {
        if (reference === null || reference === undefined || typeof reference !== 'string') {
          return {
            success: false,
            error: 'Invalid reference: must be a non-null string',
          };
        }
        
        if (reference.includes('..') || reference.includes('\0')) {
          return {
            success: false,
            error: 'Invalid reference: path traversal sequences are not allowed',
          };
        }
        return this.generateViewUrl(reference);
      },
      { maxConcurrent: 10 }
    );
  }

  /**
   * Deletes a single file from storage.
   * 
   * @param reference - The full path from uploadFile result or generateUploadUrl
   * @returns true if deleted, false if not found
   */
  async deleteFile(reference: string): Promise<boolean> {
    this.logger.debug('deleteFile called', { reference });
    
    if (reference.includes('..') || reference.includes('\0')) {
      this.logger.warn('deleteFile rejected: path traversal attempt', { reference });
      return false;
    }
    
    const result = await this.driver.delete(reference);
    
    if (result) {
      this.logger.info('File deleted successfully', { reference });
    } else {
      this.logger.warn('File deletion failed or file not found', { reference });
    }
    
    return result;
  }

  /**
   * Deletes multiple files at once.
   * Returns detailed results so you know exactly what succeeded and what failed.
   */
  async deleteFiles(references: string[]): Promise<DeleteResult[]> {
    if (!references || references.length === 0) {
      return [];
    }

    return withConcurrencyLimit(
      references,
      async (reference): Promise<DeleteResult> => {
        if (reference.includes('..') || reference.includes('\0')) {
          return {
            success: false,
            fileName: reference,
            error: 'Invalid reference: path traversal sequences are not allowed',
          };
        }
        
        try {
          const success = await this.driver.delete(reference);
          const result: DeleteResult = { success, fileName: reference };
          if (!success) {
            result.error = 'File not found or already deleted';
          }
          return result;
        } catch (error) {
          return {
            success: false,
            fileName: reference,
            error: error instanceof Error ? error.message : 'Failed to delete file',
          };
        }
      },
      { maxConcurrent: 10 }
    );
  }

  /**
   * Lists files in your storage with optional filtering and pagination.
   * 
   * @param prefix - Only show files starting with this path (e.g., 'uploads/2026/')
   * @param maxResults - How many files to return per page (default: 1000)
   * @param continuationToken - Pass the nextToken from a previous response to get the next page
   * 
   * @example
   * // Get all files
   * const result = await storage.listFiles();
   * 
   * // Get files in a specific folder
   * const result = await storage.listFiles('users/123/');
   * 
   * // Paginate through large results
   * let result = await storage.listFiles(undefined, 100);
   * while (result.nextToken) {
   *   result = await storage.listFiles(undefined, 100, result.nextToken);
   * }
   */
  async listFiles(
    prefix?: string,
    maxResults?: number,
    continuationToken?: string
  ): Promise<ListFilesResult> {
    if (prefix && (prefix.includes('..') || prefix.includes('\0'))) {
      return {
        success: false,
        error: 'Invalid prefix: path traversal sequences are not allowed',
      };
    }
    
    return this.driver.listFiles(prefix, maxResults, continuationToken);
  }

  /**
   * Returns a copy of the current configuration.
   * 
   * WARNING: This includes sensitive credentials like AWS keys, Azure connection strings, etc.
   * Use getSafeConfig() instead if you're logging or exposing this to users.
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }

  /**
   * Returns a copy of the configuration with sensitive values masked.
   * Safe for logging, debugging, or displaying to users.
   * 
   * Masked fields: awsAccessKey, awsSecretKey, azureConnectionString, 
   * azureAccountKey, gcsCredentials
   */
  getSafeConfig(): StorageConfig {
    const masked = '[REDACTED]';
    return {
      ...this.config,
      awsAccessKey: this.config.awsAccessKey ? masked : undefined,
      awsSecretKey: this.config.awsSecretKey ? masked : undefined,
      azureConnectionString: this.config.azureConnectionString ? masked : undefined,
      azureAccountKey: this.config.azureAccountKey ? masked : undefined,
      gcsCredentials: this.config.gcsCredentials ? masked : undefined,
    };
  }

  /**
   * Returns which storage driver is currently active.
   */
  getDriverType(): StorageDriver {
    return this.config.driver;
  }

  /**
   * Returns true if the driver operates in presigned mode.
   * 
   * In presigned mode, upload() returns URLs instead of uploading directly.
   * All cloud drivers can generate presigned URLs via generateUploadUrl()
   * regardless of this setting.
   */
  isPresignedUploadMode(): boolean {
    return this.config.driver.includes('-presigned');
  }

  /**
   * Returns rate limit status information.
   * Returns null if rate limiting is not configured.
   * 
   * @example
   * const status = storage.getRateLimitStatus();
   * if (status && status.remainingRequests === 0) {
   *   console.log(`Rate limited. Resets in ${status.resetTimeMs}ms`);
   * }
   */
  getRateLimitStatus(): { remainingRequests: number; resetTimeMs: number } | null {
    if (!this.rateLimiter) {
      return null;
    }
    return {
      remainingRequests: this.rateLimiter.getRemainingRequests(),
      resetTimeMs: this.rateLimiter.getResetTime(),
    };
  }

  /**
   * Returns all available storage drivers.
   */
  static getAvailableDrivers(): StorageDriver[] {
    return StorageDriverFactory.getAvailableDrivers() as StorageDriver[];
  }

  /**
   * Clears the internal driver cache.
   * Useful in tests or when you've changed credentials.
   */
  static clearCache(): void {
    StorageDriverFactory.clearCache();
  }

  /**
   * Validates a file against the provided rules.
   * Returns an error message if validation fails, null if it passes.
   */
  private validateFile(file: Express.Multer.File, options: FileValidationOptions): string | null {
    if (!file) {
      return 'No file provided';
    }
    
    // Check file size
    if (options.maxSize !== undefined && file.size > options.maxSize) {
      return `File size ${file.size} exceeds maximum allowed size of ${options.maxSize} bytes`;
    }
    
    // Check MIME type
    if (options.allowedMimeTypes) {
      // Empty array means "allow nothing" - reject all files (consistent with allowedExtensions)
      if (options.allowedMimeTypes.length === 0) {
        return 'No MIME types are allowed (allowedMimeTypes is empty). To allow all types, omit this option or use ["*/*"]';
      }
      
      // Check for wildcard that allows all types
      const allowsAll = options.allowedMimeTypes.includes('*/*') || options.allowedMimeTypes.includes('*');
      
      if (!allowsAll && !options.allowedMimeTypes.includes(file.mimetype)) {
        return `File type '${file.mimetype}' is not allowed. Allowed types: ${options.allowedMimeTypes.join(', ')}`;
      }
    }
    
    // Check file extension
    if (options.allowedExtensions) {
      // Empty array means "allow nothing" - reject all files
      if (options.allowedExtensions.length === 0) {
        return 'No file extensions are allowed (allowedExtensions is empty). To allow all extensions, use ["*"]';
      }
      
      const ext = getFileExtension(file.originalname || '').toLowerCase();
      const normalizedAllowed = options.allowedExtensions.map(e => e.toLowerCase());
      const SPECIAL_VALUES = ['', '*', 'none'];
      
      if (ext === '') {
        // File has no extension — check if that's allowed
        const allowsNoExtension = normalizedAllowed.some(e => SPECIAL_VALUES.includes(e));
        if (!allowsNoExtension) {
          return `File has no extension. Allowed extensions: ${options.allowedExtensions.join(', ')} (use '' or '*' to allow files without extensions)`;
        }
      } else {
        const normalizedExtensions = normalizedAllowed
          .filter(e => !SPECIAL_VALUES.includes(e))
          .map(e => e.startsWith('.') ? e : `.${e}`);
        const allowsAll = normalizedAllowed.includes('*');
        
        if (!allowsAll && !normalizedExtensions.includes(ext)) {
          return `File extension '${ext}' is not allowed. Allowed extensions: ${options.allowedExtensions.join(', ')}`;
        }
      }
    }
    
    return null;
  }
}
