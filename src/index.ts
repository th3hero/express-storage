/**
 * Express Storage
 * 
 * Unified file upload and storage management for Express.js.
 * One API for local disk, AWS S3, Google Cloud Storage, and Azure Blob Storage.
 * 
 * @example
 * import { StorageManager } from 'express-storage';
 * 
 * // Initialize (reads from environment variables)
 * const storage = new StorageManager();
 * 
 * // Upload a file
 * const result = await storage.uploadFile(req.file);
 * 
 * // Generate presigned URL for client-side upload
 * const url = await storage.generateUploadUrl('photo.jpg', 'image/jpeg', 12345);
 */

// Main class
export { StorageManager } from './storage-manager.js';

// Factory
export { StorageDriverFactory } from './factory/driver.factory.js';

// Types
export type {
  StorageDriver,
  FileUploadResult,
  DeleteResult,
  PresignedUrlResult,
  StorageConfig,
  StorageOptions,
  StorageCredentials,
  FileValidationOptions,
  UploadOptions,
  FileMetadata,
  FileInput,
  SingleFileInput,
  MultipleFilesInput,
  IStorageDriver,
  ValidationResult,
  EnvironmentConfig,
  BlobValidationOptions,
  BlobValidationResult,
  ListFilesResult,
  FileInfo,
  Logger,
  RateLimitOptions
} from './types/storage.types.js';

// Configuration utilities
export { loadAndValidateConfig, validateStorageConfig, initializeDotenv, resetDotenvInitialization } from './utils/config.utils.js';

// File utilities
export {
  generateUniqueFileName,
  sanitizeFileName,
  validateFileName,
  createMonthBasedPath,
  ensureDirectoryExists,
  formatFileSize,
  validateFileSize,
  validateFileType,
  getFileExtension,
  isImageFile,
  isDocumentFile,
  withRetry,
  sleep,
  withConcurrencyLimit
} from './utils/file.utils.js';
export type { RetryOptions, ConcurrencyOptions } from './utils/file.utils.js';

// Driver classes (for custom implementations or direct use)
export { BaseStorageDriver } from './drivers/base.driver.js';
export { LocalStorageDriver } from './drivers/local.driver.js';
export { S3StorageDriver, S3PresignedStorageDriver } from './drivers/s3.driver.js';
export { GCSStorageDriver, GCSPresignedStorageDriver } from './drivers/gcs.driver.js';
export { AzureStorageDriver, AzurePresignedStorageDriver } from './drivers/azure.driver.js';
