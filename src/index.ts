// Main exports
export { StorageManager } from './storage-manager.js';
export { StorageDriverFactory } from './factory/driver.factory.js';

// Type exports
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
  Logger
} from './types/storage.types.js';

// Utility exports
export { loadAndValidateConfig, validateStorageConfig, initializeDotenv } from './utils/config.utils.js';
export {
  generateUniqueFileName,
  sanitizeFileName,
  validateFileName,
  createMonthBasedPath,
  ensureDirectoryExists,
  formatFileSize,
  validateFileSize,
  validateFileType,
  createLocalFileUrl,
  getFileExtension,
  isImageFile,
  isDocumentFile,
  withRetry,
  sleep
} from './utils/file.utils.js';
export type { RetryOptions } from './utils/file.utils.js';

// Driver exports
export { BaseStorageDriver } from './drivers/base.driver.js';
export { LocalStorageDriver } from './drivers/local.driver.js';
export { S3StorageDriver, S3PresignedStorageDriver } from './drivers/s3.driver.js';
export { GCSStorageDriver, GCSPresignedStorageDriver } from './drivers/gcs.driver.js';
export { AzureStorageDriver, AzurePresignedStorageDriver } from './drivers/azure.driver.js';
