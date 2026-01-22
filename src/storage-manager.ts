import { 
  IStorageDriver, 
  FileUploadResult, 
  PresignedUrlResult, 
  FileInput, 
  StorageConfig,
  StorageOptions,
  FileValidationOptions,
  StorageDriver
} from './types/storage.types.js';
import { StorageDriverFactory } from './factory/driver.factory.js';
import { validateStorageConfig } from './utils/config.utils.js';
import { getFileExtension } from './utils/file.utils.js';

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
export class StorageManager {
  private driver: IStorageDriver;
  private config: StorageConfig;

  constructor(options?: StorageOptions) {
    // Convert options to internal config format
    this.config = this.buildConfig(options);
    
    // Validate configuration
    const validation = validateStorageConfig(this.config);
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Create driver
    this.driver = StorageDriverFactory.createDriver(this.config);
  }

  /**
   * Build internal config from options or environment
   */
  private buildConfig(options?: StorageOptions): StorageConfig {
    const driver = options?.driver || (process.env['FILE_DRIVER'] as StorageDriver) || 'local';
    const creds = options?.credentials || {};
    
    return {
      driver,
      bucketName: creds.bucketName || process.env['BUCKET_NAME'],
      localPath: creds.localPath || process.env['LOCAL_PATH'] || 'public/express-storage',
      presignedUrlExpiry: creds.presignedUrlExpiry || 
        (process.env['PRESIGNED_URL_EXPIRY'] ? parseInt(process.env['PRESIGNED_URL_EXPIRY'], 10) : 600),
      
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
   * Upload a single file with optional validation
   */
  async uploadFile(
    file: Express.Multer.File, 
    validation?: FileValidationOptions
  ): Promise<FileUploadResult> {
    // Validate file if options provided
    if (validation) {
      const validationError = this.validateFile(file, validation);
      if (validationError) {
        return { success: false, error: validationError };
      }
    }
    
    return this.driver.upload(file);
  }

  /**
   * Upload multiple files with optional validation
   */
  async uploadFiles(
    files: Express.Multer.File[], 
    validation?: FileValidationOptions
  ): Promise<FileUploadResult[]> {
    const results: FileUploadResult[] = [];
    
    for (const file of files) {
      const result = await this.uploadFile(file, validation);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Upload files with input type detection
   */
  async upload(
    input: FileInput, 
    validation?: FileValidationOptions
  ): Promise<FileUploadResult | FileUploadResult[]> {
    if (input.type === 'single') {
      return this.uploadFile(input.file, validation);
    } else {
      return this.uploadFiles(input.files, validation);
    }
  }

  /**
   * Generate presigned upload URL with optional constraints
   * 
   * @param fileName - Name of the file to upload
   * @param contentType - Optional MIME type constraint (e.g., 'image/jpeg')
   * @param maxSize - Optional max file size in bytes
   */
  async generateUploadUrl(
    fileName: string, 
    contentType?: string, 
    maxSize?: number
  ): Promise<PresignedUrlResult> {
    const result = await this.driver.generateUploadUrl(fileName, contentType, maxSize);
    
    if (result.success) {
      const response: PresignedUrlResult = {
        ...result,
        fileName,
        expiresIn: this.config.presignedUrlExpiry || 600,
      };
      if (contentType) {
        response.contentType = contentType;
      }
      if (maxSize) {
        response.maxSize = maxSize;
      }
      return response;
    }
    
    return result;
  }

  /**
   * Generate presigned view URL
   */
  async generateViewUrl(fileName: string): Promise<PresignedUrlResult> {
    const result = await this.driver.generateViewUrl(fileName);
    
    if (result.success) {
      return {
        ...result,
        fileName,
        expiresIn: this.config.presignedUrlExpiry || 600,
      };
    }
    
    return result;
  }

  /**
   * Generate multiple upload URLs
   */
  async generateUploadUrls(fileNames: string[]): Promise<PresignedUrlResult[]> {
    return this.driver.generateMultipleUploadUrls(fileNames);
  }

  /**
   * Generate multiple view URLs
   */
  async generateViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]> {
    return this.driver.generateMultipleViewUrls(fileNames);
  }

  /**
   * Delete a single file
   */
  async deleteFile(fileName: string): Promise<boolean> {
    return this.driver.delete(fileName);
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(fileNames: string[]): Promise<boolean[]> {
    return this.driver.deleteMultiple(fileNames);
  }

  /**
   * Get current configuration
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }

  /**
   * Get current driver type
   */
  getDriverType(): StorageDriver {
    return this.config.driver;
  }

  /**
   * Check if presigned URLs are supported
   */
  isPresignedSupported(): boolean {
    return this.config.driver.includes('-presigned');
  }

  /**
   * Get available drivers
   */
  static getAvailableDrivers(): StorageDriver[] {
    return StorageDriverFactory.getAvailableDrivers() as StorageDriver[];
  }

  /**
   * Clear driver cache
   */
  static clearCache(): void {
    StorageDriverFactory.clearCache();
  }

  /**
   * Validate file against options
   */
  private validateFile(file: Express.Multer.File, options: FileValidationOptions): string | null {
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
      const normalizedExtensions = options.allowedExtensions.map(e => 
        e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
      );
      if (!normalizedExtensions.includes(ext)) {
        return `File extension '${ext}' is not allowed. Allowed extensions: ${options.allowedExtensions.join(', ')}`;
      }
    }
    
    return null;
  }
}
