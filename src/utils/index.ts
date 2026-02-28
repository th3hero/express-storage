/**
 * express-storage/utils
 * 
 * Standalone utility functions for file handling, retries, and concurrency.
 * 
 * @example
 * import { withRetry, formatFileSize, withConcurrencyLimit } from 'express-storage/utils';
 */

export {
  generateUniqueFileName,
  sanitizeFileName,
  validateFileName,
  hasPathTraversal,
  encodePathSegments,
  isValidMimeType,
  validateFolderPath,
  validateFileForUpload,
  createMonthBasedPath,
  ensureDirectoryExists,
  formatFileSize,
  validateFileSize,
  validateFileType,
  getFileExtension,
  isImageFile,
  isDocumentFile,
  detectMimeType,
  withRetry,
  sleep,
  withConcurrencyLimit,
} from './file.utils.js';

export type { RetryOptions, ConcurrencyOptions } from './file.utils.js';

export { InMemoryRateLimiter, isRateLimiterAdapter } from './rate-limiter.js';
