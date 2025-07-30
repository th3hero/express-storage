// Main exports
import { StorageManager } from './storage-manager.js';
export { StorageManager } from './storage-manager.js';
export { StorageDriverFactory } from './factory/driver.factory.js';

// Type exports
export type {
  StorageDriver,
  FileUploadResult,
  PresignedUrlResult,
  StorageConfig,
  FileInput,
  SingleFileInput,
  MultipleFilesInput,
  IStorageDriver,
  StorageRequest,
  ValidationResult,
  EnvironmentConfig
} from './types/storage.types.js';

// Utility exports
export { loadAndValidateConfig, validateStorageConfig } from './utils/config.utils.js';
export {
  generateUniqueFileName,
  sanitizeFileName,
  createMonthBasedPath,
  ensureDirectoryExists,
  formatFileSize,
  validateFileSize,
  validateFileType,
  createLocalFileUrl,
  getFileExtension,
  isImageFile,
  isDocumentFile
} from './utils/file.utils.js';

// Driver exports
export { BaseStorageDriver } from './drivers/base.driver.js';
export { LocalStorageDriver } from './drivers/local.driver.js';
export { S3StorageDriver, S3PresignedStorageDriver } from './drivers/s3.driver.js';
export { GCSStorageDriver, GCSPresignedStorageDriver } from './drivers/gcs.driver.js';
export { OCIStorageDriver, OCIPresignedStorageDriver } from './drivers/oci.driver.js';

// Default instance
let defaultStorageManager: StorageManager | null = null;

/**
 * Get or create default storage manager instance
 */
export function getStorageManager(): StorageManager {
  if (!defaultStorageManager) {
    defaultStorageManager = new StorageManager();
  }
  return defaultStorageManager;
}

/**
 * Initialize default storage manager with custom config
 */
export function initializeStorageManager(config?: any): StorageManager {
  defaultStorageManager = StorageManager.initialize(config);
  return defaultStorageManager;
}

/**
 * Convenience functions for quick usage
 */
export async function uploadFile(file: Express.Multer.File) {
  return getStorageManager().uploadFile(file);
}

export async function uploadFiles(files: Express.Multer.File[]) {
  return getStorageManager().uploadFiles(files);
}

export async function generateUploadUrl(fileName: string) {
  return getStorageManager().generateUploadUrl(fileName);
}

export async function generateViewUrl(fileName: string) {
  return getStorageManager().generateViewUrl(fileName);
}

export async function deleteFile(fileName: string) {
  return getStorageManager().deleteFile(fileName);
}

export async function deleteFiles(fileNames: string[]) {
  return getStorageManager().deleteFiles(fileNames);
} 