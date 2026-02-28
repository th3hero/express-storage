/**
 * Express Storage
 * 
 * Unified file upload and storage management for Express.js.
 * One API for local disk, AWS S3, Google Cloud Storage, and Azure Blob Storage.
 * 
 * @example
 * import { StorageManager } from 'express-storage';
 * 
 * const storage = new StorageManager({ driver: 'local' });
 * const result = await storage.uploadFile(req.file);
 * 
 * if (result.success) {
 *   console.log(result.reference); // stored file path
 * }
 * 
 * // Advanced imports:
 * // import { withRetry, formatFileSize } from 'express-storage/utils';
 * // import { BaseStorageDriver } from 'express-storage/drivers';
 * // import { validateStorageConfig } from 'express-storage/config';
 */

// Core class
export { StorageManager } from './storage-manager.js';

// Rate limiter (needed for StorageOptions.rateLimiter)
export { InMemoryRateLimiter } from './utils/rate-limiter.js';

// All types — zero runtime cost, needed by TypeScript consumers
export type {
  StorageDriver,
  StorageErrorCode,
  FileUploadResult,
  FileUploadSuccess,
  FileUploadError,
  DeleteResult,
  DeleteSuccess,
  DeleteError,
  PresignedUrlResult,
  PresignedUrlSuccess,
  PresignedUrlError,
  PresignedUploadUrlResult,
  PresignedUploadUrlSuccess,
  PresignedViewUrlResult,
  PresignedViewUrlSuccess,
  BlobValidationResult,
  BlobValidationSuccess,
  BlobValidationError,
  ListFilesResult,
  ListFilesSuccess,
  ListFilesError,
  StorageConfig,
  PublicStorageConfig,
  StorageOptions,
  StorageCredentials,
  FileValidationOptions,
  UploadOptions,
  FileMetadata,
  IStorageDriver,
  ValidationResult,
  EnvironmentConfig,
  BlobValidationOptions,
  FileInfo,
  Logger,
  RateLimitOptions,
  RateLimiterAdapter,
  StorageHooks,
  HookErrorContext,
  BatchOptions,
} from './types/storage.types.js';

export type { RetryOptions, ConcurrencyOptions } from './utils/file.utils.js';
