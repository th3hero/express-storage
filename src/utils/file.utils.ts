import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Creates a unique filename that won't collide with existing files.
 * 
 * Format: {timestamp}_{random}_{sanitized_name}.{extension}
 * Example: 1769104576000_a1b2c3d4e5_my_image.jpeg
 * 
 * The random part uses crypto.randomBytes() for extra collision resistance
 * in high-throughput scenarios.
 */
export function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(6).toString('hex').substring(0, 10);
  
  // Handle dotfiles like .gitignore or .env (they have no extension)
  let extension: string;
  let baseName: string;
  
  if (originalName.startsWith('.') && !originalName.slice(1).includes('.')) {
    extension = '';
    baseName = sanitizeFileName(originalName);
  } else {
    extension = path.extname(originalName).toLowerCase();
    const sanitizedName = sanitizeFileName(originalName);
    baseName = path.basename(sanitizedName, path.extname(sanitizedName));
  }
  
  if (!baseName || baseName.trim() === '') {
    baseName = 'file';
  }
  
  return `${timestamp}_${randomSuffix}_${baseName}${extension}`;
}

/**
 * Makes a filename safe for storage by removing problematic characters.
 * 
 * Replaces anything that isn't alphanumeric, a dot, or a hyphen with underscores.
 * This ensures compatibility with all filesystems and cloud storage providers.
 * 
 * Note: Unicode characters like Chinese or emojis become underscores.
 * If you need to preserve these, consider using your own sanitization function.
 */
export function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .normalize('NFC')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  
  return sanitized || 'file';
}

/**
 * Checks if a filename is safe to use.
 * 
 * Rejects:
 * - Empty filenames
 * - Filenames over 255 characters
 * - Path traversal attempts (../, /, \)
 * - Null bytes
 * 
 * Returns an error message if invalid, null if OK.
 */
export function validateFileName(fileName: string): string | null {
  if (!fileName || typeof fileName !== 'string') {
    return 'Filename is required';
  }
  
  const trimmed = fileName.trim();
  if (trimmed.length === 0) {
    return 'Filename cannot be empty';
  }
  
  if (trimmed.length > 255) {
    return 'Filename is too long (max 255 characters)';
  }
  
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return 'Filename cannot contain path separators or traversal sequences';
  }
  
  if (trimmed.includes('\0')) {
    return 'Filename cannot contain null bytes';
  }
  
  return null;
}

/**
 * Creates a date-based folder path: YYYY/MM
 * 
 * Uses UTC to keep things consistent across timezones.
 * Example: For January 2026 -> 'uploads/2026/01'
 */
export function createMonthBasedPath(basePath: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  
  return path.join(basePath, year.toString(), month);
}

/**
 * Creates a directory if it doesn't exist.
 * Also creates any parent directories needed (recursive).
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Converts bytes to a human-readable string.
 * 
 * Examples:
 * - 1024 -> "1 KB"
 * - 1048576 -> "1 MB"
 * - 0 -> "0 Bytes"
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
    return 'Invalid size';
  }
  if (!Number.isFinite(bytes)) {
    return bytes > 0 ? 'Infinite' : 'Invalid size';
  }
  if (bytes < 0) {
    return 'Invalid size (negative)';
  }
  if (bytes === 0) {
    return '0 Bytes';
  }
  
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < sizes.length - 1) {
    size /= 1024;
    i++;
  }
  
  return Math.round(size * 100) / 100 + ' ' + sizes[i];
}

/**
 * Checks if a file size is within the allowed limit.
 */
export function validateFileSize(fileSize: number, maxSize: number): boolean {
  return fileSize <= maxSize;
}

/**
 * Checks if a MIME type is in the allowed list.
 */
export function validateFileType(mimeType: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(mimeType);
}

/**
 * Extracts the file extension (lowercase, includes the dot).
 * 
 * Examples:
 * - 'photo.jpg' -> '.jpg'
 * - '.gitignore' -> '' (dotfiles have no extension)
 * - 'archive.tar.gz' -> '.gz' (only the last extension)
 */
export function getFileExtension(fileName: string): string {
  if (!fileName) return '';
  
  // Dotfiles like .gitignore don't have extensions
  if (fileName.startsWith('.') && !fileName.slice(1).includes('.')) {
    return '';
  }
  
  return path.extname(fileName).toLowerCase();
}

/**
 * Checks if a MIME type indicates an image.
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Checks if a MIME type indicates a document (PDF, Word, Excel, etc.).
 */
export function isDocumentFile(mimeType: string): boolean {
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ];
  return documentTypes.includes(mimeType);
}

/**
 * Configuration for retry behavior.
 */
export interface RetryOptions {
  /** Total attempts including the first one. Default: 3 */
  maxAttempts?: number;
  /** Starting delay between retries in ms. Default: 1000 */
  baseDelay?: number;
  /** Maximum delay between retries in ms. Default: 10000 */
  maxDelay?: number;
  /** Use exponential backoff. Default: true */
  exponentialBackoff?: boolean;
}

/**
 * Retries an async operation with exponential backoff.
 * 
 * Great for cloud operations that might fail due to network blips
 * or rate limiting.
 * 
 * @example
 * // Retry up to 3 times with increasing delays
 * const result = await withRetry(() => storage.uploadFile(file));
 * 
 * // More aggressive retry strategy
 * const result = await withRetry(() => fetchData(), {
 *   maxAttempts: 5,
 *   baseDelay: 500
 * });
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    exponentialBackoff = true,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxAttempts) {
        const delay = exponentialBackoff
          ? Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
          : baseDelay;
        
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Operation failed after ${maxAttempts} attempts`);
}

/**
 * Pauses execution for the specified number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, ms));
}

/**
 * Configuration for concurrent execution.
 */
export interface ConcurrencyOptions {
  /** Maximum parallel operations. Default: 10 */
  maxConcurrent?: number;
}

/**
 * Processes an array with a concurrency limit.
 * 
 * Prevents overwhelming APIs or running out of resources by limiting
 * how many operations run at once.
 * 
 * Implementation uses pre-assigned chunk-based processing to avoid any
 * potential race conditions with shared index counters. Each worker gets
 * its own set of indices to process.
 * 
 * Note: The input array is snapshotted at the start to prevent issues
 * if the caller modifies it during processing.
 * 
 * @example
 * // Upload 100 files, but only 10 at a time
 * const results = await withConcurrencyLimit(
 *   files,
 *   (file) => uploadFile(file),
 *   { maxConcurrent: 10 }
 * );
 */
export async function withConcurrencyLimit<T, R>(
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  options: ConcurrencyOptions = {}
): Promise<R[]> {
  const { maxConcurrent = 10 } = options;
  
  if (items.length === 0) {
    return [];
  }
  
  // Snapshot the array to prevent issues if caller modifies it during processing
  const itemsCopy = [...items];
  const itemCount = itemsCopy.length;
  
  // For small batches, just process everything at once
  if (itemCount <= maxConcurrent) {
    return Promise.all(itemsCopy.map((item, index) => operation(item, index)));
  }
  
  const results: R[] = new Array(itemCount);
  const workerCount = Math.min(maxConcurrent, itemCount);
  
  // Pre-assign indices to each worker to avoid any race conditions
  // Each worker gets a dedicated set of indices: worker 0 gets [0, workerCount, 2*workerCount, ...],
  // worker 1 gets [1, workerCount+1, 2*workerCount+1, ...], etc.
  const createWorker = (workerId: number): Promise<void> => {
    return (async () => {
      for (let index = workerId; index < itemCount; index += workerCount) {
        const item = itemsCopy[index];
        if (item !== undefined) {
          results[index] = await operation(item, index);
        }
      }
    })();
  };
  
  // Start all workers with their pre-assigned index ranges
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(createWorker(i));
  }
  
  await Promise.all(workers);
  return results;
}
