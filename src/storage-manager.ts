import { IStorageDriver, FileUploadResult, PresignedUrlResult, FileInput, StorageConfig } from './types/storage.types.js';
import { StorageDriverFactory } from './factory/driver.factory.js';
import { loadAndValidateConfig } from './utils/config.utils.js';

/**
 * Main storage manager class
 */
export class StorageManager {
  private driver: IStorageDriver;
  private config: StorageConfig;
  private isInitialized: boolean = false;

  constructor() {
    // Initialize with default config
    const result = loadAndValidateConfig();
    
    if (!result.validation.isValid) {
      throw new Error(`Configuration validation failed: ${result.validation.errors.join(', ')}`);
    }
    
    this.config = result.config;
    this.driver = StorageDriverFactory.createDriver(result.config);
    this.isInitialized = true;
  }

  /**
   * Initialize storage manager with custom configuration
   */
  static initialize(config?: Partial<StorageConfig>): StorageManager {
    const result = loadAndValidateConfig();
    
    // Merge custom config with default
    const mergedConfig = { ...result.config, ...config };
    
    // Validate merged config
    const { validateStorageConfig } = require('./utils/config.utils');
    const validationResult = validateStorageConfig(mergedConfig);
    
    if (!validationResult.isValid) {
      throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
    }
    
    const manager = new StorageManager();
    manager.config = mergedConfig;
    manager.driver = StorageDriverFactory.createDriver(mergedConfig);
    manager.isInitialized = true;
    
    return manager;
  }

  /**
   * Upload a single file
   */
  async uploadFile(file: Express.Multer.File): Promise<FileUploadResult> {
    this.ensureInitialized();
    return this.driver.upload(file);
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(files: Express.Multer.File[]): Promise<FileUploadResult[]> {
    this.ensureInitialized();
    return this.driver.uploadMultiple(files);
  }

  /**
   * Upload files with input type detection
   */
  async upload(input: FileInput): Promise<FileUploadResult | FileUploadResult[]> {
    this.ensureInitialized();
    
    if (input.type === 'single') {
      return this.driver.upload(input.file);
    } else {
      return this.driver.uploadMultiple(input.files);
    }
  }

  /**
   * Generate upload URL for presigned uploads
   */
  async generateUploadUrl(fileName: string): Promise<PresignedUrlResult> {
    this.ensureInitialized();
    return this.driver.generateUploadUrl(fileName);
  }

  /**
   * Generate view URL for presigned uploads
   */
  async generateViewUrl(fileName: string): Promise<PresignedUrlResult> {
    this.ensureInitialized();
    return this.driver.generateViewUrl(fileName);
  }

  /**
   * Generate multiple upload URLs
   */
  async generateUploadUrls(fileNames: string[]): Promise<PresignedUrlResult[]> {
    this.ensureInitialized();
    return this.driver.generateMultipleUploadUrls(fileNames);
  }

  /**
   * Generate multiple view URLs
   */
  async generateViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]> {
    this.ensureInitialized();
    return this.driver.generateMultipleViewUrls(fileNames);
  }

  /**
   * Delete a single file
   */
  async deleteFile(fileName: string): Promise<boolean> {
    this.ensureInitialized();
    return this.driver.delete(fileName);
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(fileNames: string[]): Promise<boolean[]> {
    this.ensureInitialized();
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
  getDriverType(): string {
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
  static getAvailableDrivers(): string[] {
    return StorageDriverFactory.getAvailableDrivers();
  }

  /**
   * Clear driver cache
   */
  static clearCache(): void {
    StorageDriverFactory.clearCache();
  }

  /**
   * Ensure storage manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('StorageManager is not initialized. Call StorageManager.initialize() first.');
    }
  }
} 