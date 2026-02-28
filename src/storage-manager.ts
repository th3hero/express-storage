import { 
  IStorageDriver,
  FileUploadResult, 
  DeleteResult,
  PresignedUrlError,
  PresignedUploadUrlResult,
  PresignedUploadUrlSuccess,
  PresignedViewUrlResult,
  PresignedViewUrlSuccess,
  StorageConfig,
  PublicStorageConfig,
  StorageOptions,
  FileValidationOptions,
  StorageDriver,
  BlobValidationOptions,
  BlobValidationResult,
  ListFilesResult,
  UploadOptions,
  FileMetadata,
  FileInfo,
  BatchOptions,
  Logger,
  RateLimiterAdapter,
  StorageHooks,
  HookErrorContext
} from './types/storage.types.js';
import { createDriver, getAvailableDrivers } from './factory/driver.factory.js';
import { validateStorageConfig, loadEnvironmentConfig, environmentToStorageConfig } from './utils/config.utils.js';
import { generateUniqueFileName, validateFileName, hasPathTraversal, isValidMimeType, validateFolderPath, validateFileForUpload, withConcurrencyLimit, formatFileSize } from './utils/file.utils.js';
import { InMemoryRateLimiter, isRateLimiterAdapter } from './utils/rate-limiter.js';

/** 5 GB — default maximum file size */
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

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
 * // Full-featured setup
 * const storage = new StorageManager({
 *   driver: 's3',
 *   credentials: { bucketName: 'my-bucket', awsRegion: 'us-east-1' },
 *   hooks: {
 *     beforeUpload: async (file) => { await virusScan(file.buffer); },
 *     afterUpload: (result) => { auditLog('file_uploaded', result); },
 *   },
 *   rateLimiter: { maxRequests: 100, windowMs: 60000 },
 *   concurrency: 5,
 * });
 */
export class StorageManager {
  private driver: IStorageDriver;
  private readonly config: StorageConfig;
  private readonly logger: Logger;
  private rateLimiter: RateLimiterAdapter | null = null;
  private hooks: StorageHooks;
  private readonly concurrency: number;
  private destroyed = false;

  constructor(options?: StorageOptions) {
    this.logger = options?.logger || noopLogger;
    this.config = this.buildConfig(options);
    this.hooks = options?.hooks || {};
    this.concurrency = options?.concurrency ?? 10;
    
    // Initialize rate limiter — accepts either plain options or a custom adapter
    if (options?.rateLimiter) {
      if (isRateLimiterAdapter(options.rateLimiter)) {
        this.rateLimiter = options.rateLimiter;
        this.logger.debug('Custom rate limiter adapter configured');
      } else {
        this.rateLimiter = new InMemoryRateLimiter(options.rateLimiter);
        this.logger.debug('In-memory rate limiting enabled', { 
          maxRequests: options.rateLimiter.maxRequests,
          windowMs: options.rateLimiter.windowMs || 60000
        });
      }
    }
    
    this.logger.debug('StorageManager initializing', { driver: this.config.driver });
    
    const validation = validateStorageConfig(this.config);
    if (!validation.isValid) {
      this.logger.error('Configuration validation failed', { errors: validation.errors });
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
    
    this.driver = createDriver(this.config);
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
        driver: baseConfig.driver ?? 'local',
        maxFileSize: baseConfig.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      };
    }
    
    const creds = options.credentials || {};
    
    return {
      driver: options.driver ?? baseConfig.driver ?? 'local',
      bucketName: creds.bucketName ?? baseConfig.bucketName,
      bucketPath: creds.bucketPath ?? baseConfig.bucketPath ?? '',
      localPath: creds.localPath ?? baseConfig.localPath ?? 'public/express-storage',
      presignedUrlExpiry: creds.presignedUrlExpiry ?? baseConfig.presignedUrlExpiry ?? 600,
      maxFileSize: creds.maxFileSize ?? baseConfig.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      
      awsRegion: creds.awsRegion ?? baseConfig.awsRegion,
      awsAccessKey: creds.awsAccessKey ?? baseConfig.awsAccessKey,
      awsSecretKey: creds.awsSecretKey ?? baseConfig.awsSecretKey,
      
      gcsProjectId: creds.gcsProjectId ?? baseConfig.gcsProjectId,
      gcsCredentials: creds.gcsCredentials ?? baseConfig.gcsCredentials,
      
      azureConnectionString: creds.azureConnectionString ?? baseConfig.azureConnectionString,
      azureAccountName: creds.azureAccountName ?? baseConfig.azureAccountName,
      azureAccountKey: creds.azureAccountKey ?? baseConfig.azureAccountKey,
      azureContainerName: creds.azureContainerName ?? baseConfig.azureContainerName,
    };
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('StorageManager has been destroyed and cannot be reused. Create a new instance.');
    }
  }

  // ---------------------------------------------------------------------------
  // Upload methods
  // ---------------------------------------------------------------------------

  /**
   * Uploads a single file to your configured storage.
   * 
   * @param file - The file from Multer (req.file)
   * @param validation - Optional rules like max size and allowed types
   * @param uploadOptions - Optional metadata, cache headers, etc.
   * 
   * @example
   * const result = await storage.uploadFile(req.file, {
   *   maxSize: 5 * 1024 * 1024,
   *   allowedMimeTypes: ['image/jpeg', 'image/png'],
   * });
   * if (result.success) {
   *   console.log(result.reference, result.fileUrl);
   * }
   */
  async uploadFile(
    file: Express.Multer.File, 
    validation?: FileValidationOptions,
    uploadOptions?: UploadOptions
  ): Promise<FileUploadResult> {
    this.assertNotDestroyed();
    if (!file) {
      this.logger.warn('uploadFile called with null/undefined file');
      return { success: false, error: 'No file provided', code: 'NO_FILE' };
    }

    this.logger.debug('uploadFile called', { 
      originalName: file.originalname, 
      size: file.size, 
      mimeType: file.mimetype 
    });

    return this.executeSingleUpload(file, validation, uploadOptions, 'upload');
  }

  /**
   * Uploads multiple files at once.
   * Files are processed in parallel (up to concurrency limit) for speed,
   * but each file gets its own result — one failure doesn't stop the others.
   * 
   * @example
   * const results = await storage.uploadFiles(req.files, {
   *   maxSize: 10 * 1024 * 1024,
   * });
   * const uploaded = results.filter(r => r.success);
   * const failed = results.filter(r => !r.success);
   */
  async uploadFiles(
    files: Express.Multer.File[], 
    validation?: FileValidationOptions,
    uploadOptions?: UploadOptions,
    options?: BatchOptions
  ): Promise<FileUploadResult[]> {
    this.assertNotDestroyed();
    if (!files || files.length === 0) {
      return [];
    }
    
    return withConcurrencyLimit(
      files,
      (file) => this.executeSingleUpload(file, validation, uploadOptions, 'uploadMultiple'),
      { maxConcurrent: this.concurrency, signal: options?.signal }
    );
  }

  // ---------------------------------------------------------------------------
  // Presigned URL methods
  // ---------------------------------------------------------------------------

  /**
   * Creates a presigned URL that lets clients upload directly to cloud storage.
   * 
   * The URL is time-limited and (for S3/GCS) locked to specific file constraints.
   * 
   * @param fileName - What the user wants to call their file
   * @param contentType - The MIME type (e.g., 'image/jpeg')
   * @param fileSize - Exact size in bytes (enforced by S3/GCS, advisory for Azure)
   * @param folder - Where to put the file (overrides your default BUCKET_PATH)
   * 
   * @example
   * const result = await storage.generateUploadUrl('photo.jpg', 'image/jpeg', 204800);
   * if (result.success) {
   *   // result.uploadUrl  — PUT request goes here
   *   // result.reference  — save this to confirm/view/delete later
   *   // result.expiresIn  — seconds until URL expires
   * }
   */
  async generateUploadUrl(
    fileName: string, 
    contentType?: string, 
    fileSize?: number,
    folder?: string
  ): Promise<PresignedUploadUrlResult> {
    this.assertNotDestroyed();
    const rateLimitError = await this.checkRateLimit();
    if (rateLimitError) return rateLimitError;
    
    const fileNameError = validateFileName(fileName);
    if (fileNameError) {
      return { success: false, error: fileNameError, code: 'INVALID_FILENAME' };
    }

    if (fileSize !== undefined) {
      if (typeof fileSize !== 'number' || Number.isNaN(fileSize) || fileSize < 0) {
        return { success: false, error: 'fileSize must be a non-negative number', code: 'INVALID_INPUT' };
      }
      
      const maxAllowedSize = this.config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
      const effectiveMaxSize = maxAllowedSize > 0 ? maxAllowedSize : DEFAULT_MAX_FILE_SIZE;
      
      if (fileSize > effectiveMaxSize) {
        return {
          success: false,
          error: `fileSize cannot exceed ${effectiveMaxSize} bytes (${formatFileSize(effectiveMaxSize)})`,
          code: 'FILE_TOO_LARGE',
        };
      }
    }

    if (contentType && !isValidMimeType(contentType)) {
      return {
        success: false,
        error: `Invalid contentType format: '${contentType}'. Expected format: type/subtype (e.g., 'image/jpeg')`,
        code: 'INVALID_INPUT',
      };
    }

    const uniqueFileName = generateUniqueFileName(fileName);
    const effectiveFolder = folder !== undefined ? folder : (this.config.bucketPath || '');
    
    if (effectiveFolder) {
      const folderValidationError = validateFolderPath(effectiveFolder);
      if (folderValidationError) {
        return { success: false, error: folderValidationError, code: 'PATH_TRAVERSAL' };
      }
    }
    
    const reference = this.buildFilePath(uniqueFileName, effectiveFolder);
    const result = await this.driver.generateUploadUrl(reference, contentType, fileSize);
    
    if (result.success) {
      const response: PresignedUploadUrlSuccess = {
        success: true,
        fileName: uniqueFileName,
        reference,
        uploadUrl: result.uploadUrl ?? '',
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
      if (this.config.driver === 'azure-presigned') {
        response.requiresValidation = true;
      }
      return response;
    }
    
    return result;
  }

  /**
   * Creates a presigned URL for viewing/downloading an existing file.
   * 
   * @param reference - The full path you got from generateUploadUrl
   */
  async generateViewUrl(reference: string): Promise<PresignedViewUrlResult> {
    this.assertNotDestroyed();
    const rateLimitError = await this.checkRateLimit();
    if (rateLimitError) return rateLimitError;

    if (hasPathTraversal(reference)) {
      return {
        success: false,
        error: 'Invalid reference: path traversal sequences are not allowed',
        code: 'PATH_TRAVERSAL',
      };
    }
    
    const result = await this.driver.generateViewUrl(reference);
    
    if (result.success) {
      const response: PresignedViewUrlSuccess = {
        success: true,
        reference,
        viewUrl: result.viewUrl ?? '',
        expiresIn: this.config.presignedUrlExpiry || 600,
      };
      return response;
    }
    
    return result;
  }

  /**
   * Verifies that a presigned upload actually happened and the file is valid.
   * 
   * For Azure, this is essential — Azure doesn't enforce file constraints at
   * the URL level, so we check the actual blob properties here.
   * For S3/GCS, this confirms the file exists and optionally validates it.
   */
  async validateAndConfirmUpload(
    reference: string,
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    this.assertNotDestroyed();
    if (hasPathTraversal(reference)) {
      return {
        success: false,
        error: 'Invalid reference: path traversal sequences are not allowed',
        code: 'PATH_TRAVERSAL',
      };
    }
    
    return this.driver.validateAndConfirmUpload(reference, options);
  }

  /**
   * Returns true if you're using Azure presigned mode.
   * Your hint that you MUST call validateAndConfirmUpload() after presigned uploads.
   */
  requiresPostUploadValidation(): boolean {
    return this.config.driver === 'azure-presigned';
  }

  /**
   * Creates presigned upload URLs for multiple files at once.
   */
  async generateUploadUrls(
    files: (string | FileMetadata)[],
    folder?: string,
    options?: BatchOptions
  ): Promise<PresignedUploadUrlResult[]> {
    this.assertNotDestroyed();
    if (!files || files.length === 0) {
      return [];
    }

    const effectiveFolder = folder !== undefined ? folder : (this.config.bucketPath || '');
    
    return withConcurrencyLimit(
      files,
      async (file): Promise<PresignedUploadUrlResult> => {
        if (file === null || file === undefined) {
          return {
            success: false,
            error: 'Invalid input: file entry cannot be null or undefined',
            code: 'INVALID_INPUT',
          };
        }
        
        if (typeof file === 'string') {
          return this.generateUploadUrl(file, undefined, undefined, effectiveFolder);
        }
        
        if (typeof file !== 'object') {
          return {
            success: false,
            error: `Invalid input type: expected string or FileMetadata object, got ${typeof file}`,
            code: 'INVALID_INPUT',
          };
        }
        
        if (!file.fileName || typeof file.fileName !== 'string') {
          return {
            success: false,
            error: 'FileMetadata must have a valid fileName property',
            code: 'INVALID_INPUT',
          };
        }
        
        return this.generateUploadUrl(
          file.fileName,
          file.contentType,
          file.fileSize,
          effectiveFolder
        );
      },
      { maxConcurrent: this.concurrency, signal: options?.signal }
    );
  }

  /**
   * Creates presigned view URLs for multiple files at once.
   */
  async generateViewUrls(
    references: string[],
    options?: BatchOptions
  ): Promise<PresignedViewUrlResult[]> {
    this.assertNotDestroyed();
    if (!references || references.length === 0) {
      return [];
    }

    return withConcurrencyLimit(
      references,
      async (reference): Promise<PresignedViewUrlResult> => {
        if (reference === null || reference === undefined || typeof reference !== 'string') {
          return {
            success: false,
            error: 'Invalid reference: must be a non-null string',
            code: 'INVALID_INPUT',
          };
        }
        return this.generateViewUrl(reference);
      },
      { maxConcurrent: this.concurrency, signal: options?.signal }
    );
  }

  // ---------------------------------------------------------------------------
  // Delete methods
  // ---------------------------------------------------------------------------

  /**
   * Deletes a single file from storage.
   * 
   * @param reference - The full path from uploadFile result or generateUploadUrl
   * @returns DeleteResult with success status and error details on failure
   * 
   * @example
   * const result = await storage.deleteFile(uploadResult.reference);
   * if (!result.success) {
   *   console.log(result.error, result.code); // e.g., 'FILE_NOT_FOUND'
   * }
   */
  async deleteFile(reference: string): Promise<DeleteResult> {
    this.assertNotDestroyed();
    this.logger.debug('deleteFile called', { reference });
    return this.executeSingleDelete(reference, 'delete');
  }

  /**
   * Deletes multiple files at once.
   */
  async deleteFiles(references: string[], options?: BatchOptions): Promise<DeleteResult[]> {
    this.assertNotDestroyed();
    if (!references || references.length === 0) {
      return [];
    }

    return withConcurrencyLimit(
      references,
      (reference) => this.executeSingleDelete(reference, 'deleteMultiple'),
      { maxConcurrent: this.concurrency, signal: options?.signal }
    );
  }

  // ---------------------------------------------------------------------------
  // List files
  // ---------------------------------------------------------------------------

  /**
   * Lists files in your storage with optional filtering and pagination.
   * 
   * @param prefix - Only show files starting with this path
   * @param maxResults - How many files to return per page (default: 1000)
   * @param continuationToken - Pass nextToken from previous response for next page
   */
  async listFiles(
    prefix?: string,
    maxResults?: number,
    continuationToken?: string
  ): Promise<ListFilesResult> {
    this.assertNotDestroyed();
    if (prefix && hasPathTraversal(prefix)) {
      return {
        success: false,
        error: 'Invalid prefix: path traversal sequences are not allowed',
        code: 'PATH_TRAVERSAL',
      };
    }
    
    return this.driver.listFiles(prefix, maxResults, continuationToken);
  }

  // ---------------------------------------------------------------------------
  // File metadata
  // ---------------------------------------------------------------------------

  /**
   * Returns metadata about a file without downloading it.
   * 
   * @param reference - The full path from uploadFile result or generateUploadUrl
   * @returns FileInfo with name, size, contentType, lastModified — or null if not found
   * 
   * @example
   * const info = await storage.getMetadata(uploadResult.reference);
   * if (info) {
   *   console.log(`${info.name}: ${info.size} bytes, ${info.contentType}`);
   * }
   */
  async getMetadata(reference: string): Promise<FileInfo | null> {
    this.assertNotDestroyed();
    if (hasPathTraversal(reference)) {
      return null;
    }
    return this.driver.getMetadata(reference);
  }

  /**
   * Returns true if a file exists at the given reference.
   * 
   * @param reference - The full path from uploadFile result or generateUploadUrl
   */
  async exists(reference: string): Promise<boolean> {
    const metadata = await this.getMetadata(reference);
    return metadata !== null;
  }

  // ---------------------------------------------------------------------------
  // Configuration accessors
  // ---------------------------------------------------------------------------

  /**
   * Returns a copy of the current configuration without credentials.
   * Safe to log, expose in admin panels, or include in error reports.
   */
  getConfig(): PublicStorageConfig {
    return {
      driver: this.config.driver,
      bucketName: this.config.bucketName,
      bucketPath: this.config.bucketPath,
      localPath: this.config.localPath,
      presignedUrlExpiry: this.config.presignedUrlExpiry,
      maxFileSize: this.config.maxFileSize,
      awsRegion: this.config.awsRegion,
      gcsProjectId: this.config.gcsProjectId,
      azureAccountName: this.config.azureAccountName,
      azureContainerName: this.config.azureContainerName,
    };
  }

  getDriverType(): StorageDriver {
    return this.config.driver;
  }

  /**
   * Returns true if the driver operates in presigned mode.
   * In presigned mode, upload() returns URLs instead of uploading directly.
   */
  isPresignedUploadMode(): boolean {
    return this.config.driver.includes('-presigned');
  }

  /**
   * Returns rate limit status information.
   * Returns null if rate limiting is not configured.
   */
  async getRateLimitStatus(): Promise<{ remainingRequests: number; resetTimeMs: number } | null> {
    this.assertNotDestroyed();
    if (!this.rateLimiter) {
      return null;
    }
    return {
      remainingRequests: await this.rateLimiter.getRemainingRequests(),
      resetTimeMs: await this.rateLimiter.getResetTime(),
    };
  }

  static getAvailableDrivers(): StorageDriver[] {
    return getAvailableDrivers() as StorageDriver[];
  }

  /**
   * Releases resources held by this StorageManager instance.
   * Clears the rate limiter and hooks. The instance should not be reused
   * after calling this method.
   * 
   * @example
   * const storage = new StorageManager({ driver: 's3' });
   * // ... use storage ...
   * storage.destroy(); // free resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.driver.destroy();
    this.rateLimiter = null;
    this.hooks = {};
    this.logger.info('StorageManager destroyed');
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Shared upload orchestration: validation → beforeUpload hook → driver.upload → afterUpload hook.
   * Used by both uploadFile() and uploadFiles() to eliminate duplication.
   */
  private async executeSingleUpload(
    file: Express.Multer.File,
    validation: FileValidationOptions | undefined,
    uploadOptions: UploadOptions | undefined,
    operation: 'upload' | 'uploadMultiple'
  ): Promise<FileUploadResult> {
    if (validation) {
      const validationResult = validateFileForUpload(file, validation);
      if (validationResult) {
        const error = operation === 'uploadMultiple'
          ? `File '${file.originalname || 'unknown'}': ${validationResult.error}`
          : validationResult.error;
        this.logger.warn('File validation failed', { error: validationResult.error });
        return { success: false, error, code: validationResult.code };
      }
    }

    if (uploadOptions?.contentType && !isValidMimeType(uploadOptions.contentType)) {
      const error = `Invalid contentType format: '${uploadOptions.contentType}'. Expected format: type/subtype (e.g., 'image/jpeg')`;
      return { success: false, error, code: 'INVALID_INPUT' };
    }

    try {
      await this.hooks.beforeUpload?.(file, uploadOptions);
    } catch (error) {
      const hookError = error instanceof Error ? error : new Error(String(error));
      await this.invokeOnError(hookError, { operation, file });
      const msg = operation === 'uploadMultiple'
        ? `File '${file.originalname}': Upload aborted by hook: ${hookError.message}`
        : `Upload aborted by hook: ${hookError.message}`;
      this.logger.warn('beforeUpload hook aborted upload', { error: hookError.message });
      return { success: false, error: msg, code: 'HOOK_ABORTED' };
    }

    let result: FileUploadResult;
    try {
      result = await this.driver.upload(file, uploadOptions);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to upload file';
      result = {
        success: false,
        error: operation === 'uploadMultiple' ? `File '${file.originalname}': ${errorMsg}` : errorMsg,
        code: 'PROVIDER_ERROR',
      };
    }

    if (result.success) {
      this.logger.info('File uploaded successfully', { reference: result.reference });
    } else {
      this.logger.error('File upload failed', { error: result.error });
      await this.invokeOnError(new Error(result.error), { operation, file });
    }

    try {
      await this.hooks.afterUpload?.(result, file);
    } catch (hookError) {
      this.logger.warn('afterUpload hook threw', { error: hookError instanceof Error ? hookError.message : String(hookError) });
    }

    return result;
  }

  /**
   * Shared delete orchestration: path check → beforeDelete hook → driver.delete → afterDelete hook.
   * Used by both deleteFile() and deleteFiles() to eliminate duplication.
   */
  private async executeSingleDelete(reference: string, operation: 'delete' | 'deleteMultiple'): Promise<DeleteResult> {
    if (hasPathTraversal(reference)) {
      this.logger.warn('delete rejected: path traversal attempt', { reference });
      return { success: false, reference, error: 'Invalid reference: path traversal sequences are not allowed', code: 'PATH_TRAVERSAL' };
    }

    try {
      await this.hooks.beforeDelete?.(reference);
    } catch (error) {
      const hookError = error instanceof Error ? error : new Error(String(error));
      await this.invokeOnError(hookError, { operation, reference });
      return { success: false, reference, error: `Deletion aborted by hook: ${hookError.message}`, code: 'HOOK_ABORTED' };
    }

    let result: DeleteResult;
    try {
      result = await this.driver.delete(reference);
    } catch (error) {
      result = { success: false, reference, error: error instanceof Error ? error.message : 'Failed to delete file', code: 'PROVIDER_ERROR' };
    }

    try {
      await this.hooks.afterDelete?.(reference, result.success);
    } catch {
      // afterDelete hook errors are non-fatal
    }

    if (result.success) {
      this.logger.info('File deleted successfully', { reference });
    } else {
      this.logger.warn('File deletion failed', { reference, error: result.error });
    }

    return result;
  }

  private async checkRateLimit(): Promise<PresignedUrlError | null> {
    if (!this.rateLimiter) return null;
    
    const allowed = await this.rateLimiter.tryAcquire();
    if (!allowed) {
      const resetTime = await this.rateLimiter.getResetTime();
      this.logger.warn('Rate limit exceeded for presigned URL generation', { resetTimeMs: resetTime });
      return {
        success: false,
        error: `Rate limit exceeded. Try again in ${Math.ceil(resetTime / 1000)} seconds.`,
        code: 'RATE_LIMITED',
      };
    }
    
    return null;
  }

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
   * Safely invokes the onError hook. Swallows hook exceptions to prevent
   * error-in-error-handler cascades.
   */
  private async invokeOnError(error: Error, context: HookErrorContext): Promise<void> {
    try {
      await this.hooks.onError?.(error, context);
    } catch {
      // Never let an error hook crash the caller
    }
  }
}
