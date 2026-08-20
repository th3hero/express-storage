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
  HookErrorContext,
  StorageFile
} from './types/storage.types.js';
import { STORAGE_DRIVERS, DEFAULT_MAX_FILE_SIZE, DEFAULT_PRESIGNED_URL_EXPIRY, DEFAULT_CONCURRENCY, DEFAULT_LOCAL_PATH } from './constants.js';
import { validateStorageConfig, loadEnvironmentConfig, environmentToStorageConfig } from './utils/config.utils.js';
import { generateUniqueFileName, validateFileName, hasPathTraversal, isValidMimeType, validateFolderPath, validateFileForUpload, withConcurrencyLimit, formatFileSize, joinStoragePath } from './utils/file.utils.js';
import { InMemoryRateLimiter, isRateLimiterAdapter } from './utils/rate-limiter.js';

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class StorageManager {
  private driverPromise: Promise<IStorageDriver> | undefined;
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
    this.concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
    
    if (options?.rateLimiter) {
      if (isRateLimiterAdapter(options.rateLimiter)) {
        this.rateLimiter = options.rateLimiter;
      } else {
        this.rateLimiter = new InMemoryRateLimiter(options.rateLimiter);
      }
    }
    
    const validation = validateStorageConfig(this.config);
    if (!validation.isValid) {
      this.logger.error('Configuration validation failed', { errors: validation.errors });
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
    
    this.driverPromise = this.instantiateDriver(this.config);
    void this.driverPromise.catch((error) => {
      this.logger.error('Driver initialization failed', { error });
    });
    this.logger.info('StorageManager initialized', { driver: this.config.driver });
  }

  private buildConfig(options?: StorageOptions): StorageConfig {
    const envConfig = loadEnvironmentConfig();
    const baseConfig = environmentToStorageConfig(envConfig);
    
    if (!options) {
      return {
        ...baseConfig,
        driver: baseConfig.driver || 'local',
        maxFileSize: baseConfig.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      };
    }
    
    const creds = options.credentials || {};
    
    return {
      driver: options.driver || baseConfig.driver || 'local',
      bucketName: creds.bucketName ?? baseConfig.bucketName,
      bucketPath: creds.bucketPath ?? baseConfig.bucketPath ?? '',
      localPath: creds.localPath ?? baseConfig.localPath ?? DEFAULT_LOCAL_PATH,
      presignedUrlExpiry: creds.presignedUrlExpiry ?? baseConfig.presignedUrlExpiry ?? DEFAULT_PRESIGNED_URL_EXPIRY,
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

  private async getDriver(): Promise<IStorageDriver> {
    this.assertNotDestroyed();
    if (!this.driverPromise) {
      this.driverPromise = this.instantiateDriver(this.config);
    }
    return this.driverPromise;
  }

  private async instantiateDriver(config: StorageConfig): Promise<IStorageDriver> {
    switch (config.driver) {
      case 'local': {
        const { LocalStorageDriver } = await import('./drivers/local.driver.js');
        return new LocalStorageDriver(config);
      }
      case 's3':
      case 's3-presigned': {
        const { S3StorageDriver } = await import('./drivers/s3.driver.js');
        return new S3StorageDriver(config);
      }
      case 'gcs':
      case 'gcs-presigned': {
        const { GCSStorageDriver } = await import('./drivers/gcs.driver.js');
        return new GCSStorageDriver(config);
      }
      case 'azure':
      case 'azure-presigned': {
        const { AzureStorageDriver } = await import('./drivers/azure.driver.js');
        return new AzureStorageDriver(config);
      }
      default:
        throw new Error(`Unsupported storage driver: ${config.driver}`);
    }
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('StorageManager has been destroyed and cannot be reused. Create a new instance.');
    }
  }

  async uploadFile(
    file: StorageFile, 
    validation?: FileValidationOptions,
    uploadOptions?: UploadOptions
  ): Promise<FileUploadResult> {
    this.assertNotDestroyed();
    if (!file) {
      this.logger.warn('uploadFile called with null/undefined file');
      return { success: false, error: 'No file provided', code: 'NO_FILE' };
    }

    return this.executeSingleUpload(file, validation, uploadOptions, 'upload');
  }

  async uploadFiles(
    files: StorageFile[], 
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
    
    const reference = joinStoragePath(uniqueFileName, effectiveFolder);
    const driver = await this.getDriver();
    const result = await driver.generateUploadUrl(reference, contentType, fileSize);
    
    if (result.success) {
      const response: PresignedUploadUrlSuccess = {
        success: true,
        fileName: uniqueFileName,
        reference,
        uploadUrl: result.uploadUrl ?? '',
        expiresIn: this.config.presignedUrlExpiry || DEFAULT_PRESIGNED_URL_EXPIRY,
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
    
    const driver = await this.getDriver();
    const result = await driver.generateViewUrl(reference);
    
    if (result.success) {
      const response: PresignedViewUrlSuccess = {
        success: true,
        reference,
        viewUrl: result.viewUrl ?? '',
        expiresIn: this.config.presignedUrlExpiry || DEFAULT_PRESIGNED_URL_EXPIRY,
      };
      return response;
    }
    
    return result;
  }

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
    
    const driver = await this.getDriver();
    return driver.validateAndConfirmUpload(reference, options);
  }

  
  requiresPostUploadValidation(): boolean {
    return this.config.driver === 'azure-presigned';
  }

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

  async deleteFile(reference: string): Promise<DeleteResult> {
    this.assertNotDestroyed();
    return this.executeSingleDelete(reference, 'delete');
  }

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
    
    const driver = await this.getDriver();
    return driver.listFiles(prefix, maxResults, continuationToken);
  }

  async getMetadata(reference: string): Promise<FileInfo | null> {
    this.assertNotDestroyed();
    if (hasPathTraversal(reference)) {
      return null;
    }
    const driver = await this.getDriver();
    return driver.getMetadata(reference);
  }

  async exists(reference: string): Promise<boolean> {
    const metadata = await this.getMetadata(reference);
    return metadata !== null;
  }

  
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

  
  isPresignedUploadMode(): boolean {
    return this.config.driver.includes('-presigned');
  }

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
    return [...STORAGE_DRIVERS];
  }

  
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const pending = this.driverPromise;
    this.driverPromise = undefined;
    void pending?.then((driver) => { driver.destroy(); }).catch(() => {});
    this.rateLimiter = null;
    this.hooks = {};
    this.logger.info('StorageManager destroyed');
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  private async executeSingleUpload(
    file: StorageFile,
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
      const driver = await this.getDriver();
      result = await driver.upload(file, uploadOptions);
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
      const driver = await this.getDriver();
      result = await driver.delete(reference);
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

  private async invokeOnError(error: Error, context: HookErrorContext): Promise<void> {
    try {
      await this.hooks.onError?.(error, context);
    } catch {
      // Never let an error hook crash the caller
    }
  }
}
