import path from 'path';
import fsPromises from 'fs/promises';
import crypto from 'crypto';
import type { StorageErrorCode } from '../types/storage.types.js';

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
  const randomSuffix = crypto.randomBytes(5).toString('hex');
  
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
 * Returns true if the value contains path traversal sequences (`..`) or null bytes.
 * Checks both the raw value and its URL-decoded form to catch encoded attacks
 * like `%2e%2e/etc/passwd`.
 */
export function hasPathTraversal(value: string): boolean {
  if (value.includes('..') || value.includes('\0')) {
    return true;
  }
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes('..') || decoded.includes('\0');
  } catch {
    return true;
  }
}

/**
 * URL-encodes each segment of a `/`-separated path individually.
 * Preserves the `/` separators while encoding special characters within segments.
 */
export function encodePathSegments(filePath: string): string {
  return filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
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
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await fsPromises.mkdir(dirPath, { recursive: true });
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
 * Returns true if the string is a valid MIME type format (type/subtype).
 */
export function isValidMimeType(mimeType: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/.test(mimeType);
}

/**
 * Validates a folder path for use in storage operations.
 * Returns an error message if invalid, null if OK.
 */
export function validateFolderPath(folder: string): string | null {
  if (hasPathTraversal(folder)) {
    return folder.includes('..')
      ? 'Folder path cannot contain path traversal sequences (..)'
      : 'Folder path cannot contain null bytes';
  }

  if (/[<>:"|?*\\;$`']/.test(folder)) {
    return "Folder path contains invalid characters. Avoid: < > : \" | ? * \\ ; $ ` '";
  }

  if (/\/{2,}/.test(folder)) {
    return 'Folder path cannot contain consecutive slashes';
  }

  return null;
}

/**
 * Validates a file against upload constraints (size, MIME type, extension).
 * Returns `{ error, code }` on failure, `null` if the file passes all checks.
 */
export function validateFileForUpload(
  file: Express.Multer.File,
  options: { maxSize?: number; allowedMimeTypes?: string[]; allowedExtensions?: string[] }
): { error: string; code: StorageErrorCode } | null {
  if (!file) {
    return { error: 'No file provided', code: 'NO_FILE' };
  }

  if (options.maxSize !== undefined && file.size > options.maxSize) {
    return { error: `File size ${file.size} exceeds maximum allowed size of ${options.maxSize} bytes`, code: 'FILE_TOO_LARGE' };
  }

  if (options.allowedMimeTypes) {
    if (options.allowedMimeTypes.length === 0) {
      return { error: 'No MIME types are allowed (allowedMimeTypes is empty). To allow all types, omit this option or use ["*/*"]', code: 'INVALID_MIME_TYPE' };
    }

    const allowsAll = options.allowedMimeTypes.includes('*/*') || options.allowedMimeTypes.includes('*');

    if (!allowsAll && !options.allowedMimeTypes.includes(file.mimetype)) {
      return { error: `File type '${file.mimetype}' is not allowed. Allowed types: ${options.allowedMimeTypes.join(', ')}`, code: 'INVALID_MIME_TYPE' };
    }
  }

  if (options.allowedExtensions) {
    if (options.allowedExtensions.length === 0) {
      return { error: 'No file extensions are allowed (allowedExtensions is empty). To allow all extensions, use ["*"]', code: 'INVALID_EXTENSION' };
    }

    const ext = getFileExtension(file.originalname || '').toLowerCase();
    const normalizedAllowed = options.allowedExtensions.map(e => e.toLowerCase());
    const SPECIAL_VALUES = ['', '*', 'none'];

    if (ext === '') {
      const allowsNoExtension = normalizedAllowed.some(e => SPECIAL_VALUES.includes(e));
      if (!allowsNoExtension) {
        return { error: `File has no extension. Allowed extensions: ${options.allowedExtensions.join(', ')} (use '' or '*' to allow files without extensions)`, code: 'INVALID_EXTENSION' };
      }
    } else {
      const normalizedExtensions = normalizedAllowed
        .filter(e => !SPECIAL_VALUES.includes(e))
        .map(e => e.startsWith('.') ? e : `.${e}`);
      const allowsAllExt = normalizedAllowed.includes('*');

      if (!allowsAllExt && !normalizedExtensions.includes(ext)) {
        return { error: `File extension '${ext}' is not allowed. Allowed extensions: ${options.allowedExtensions.join(', ')}`, code: 'INVALID_EXTENSION' };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// MIME type detection from file content (magic bytes)
// ---------------------------------------------------------------------------

const MAGIC_SIGNATURES: Array<{ bytes: number[]; mimeType: string; offset?: number }> = [
  { bytes: [0xFF, 0xD8, 0xFF], mimeType: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mimeType: 'image/png' },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mimeType: 'image/gif' },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mimeType: 'image/gif' },
  { bytes: [0x42, 0x4D], mimeType: 'image/bmp' },
  { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: 'application/pdf' },
  { bytes: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/zip' },
  { bytes: [0x50, 0x4B, 0x05, 0x06], mimeType: 'application/zip' },
  { bytes: [0x50, 0x4B, 0x07, 0x08], mimeType: 'application/zip' },
  { bytes: [0x1F, 0x8B], mimeType: 'application/gzip' },
  { bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], mimeType: 'application/vnd.rar' },
  { bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], mimeType: 'application/x-7z-compressed' },
  { bytes: [0x49, 0x44, 0x33], mimeType: 'audio/mpeg' },
  { bytes: [0xFF, 0xFB], mimeType: 'audio/mpeg' },
  { bytes: [0xFF, 0xFA], mimeType: 'audio/mpeg' },
  { bytes: [0x4F, 0x67, 0x67, 0x53], mimeType: 'audio/ogg' },
  { bytes: [0x66, 0x74, 0x79, 0x70], mimeType: 'video/mp4', offset: 4 },
  { bytes: [0x4D, 0x5A], mimeType: 'application/x-msdownload' },
  { bytes: [0x7F, 0x45, 0x4C, 0x46], mimeType: 'application/x-executable' },
];

/**
 * Detects MIME type from file content by examining magic bytes.
 *
 * Useful in `beforeUpload` hooks to verify that a file's actual content
 * matches its declared MIME type — particularly for cloud uploads where
 * the driver trusts the client-provided MIME type.
 *
 * @param data - Buffer containing at least the first 12 bytes of the file
 * @returns Detected MIME type, or undefined if unknown
 *
 * @example
 * const storage = new StorageManager({
 *   hooks: {
 *     beforeUpload: async (file) => {
 *       const actual = detectMimeType(file.buffer);
 *       if (actual && actual !== file.mimetype) {
 *         throw new Error(`Content mismatch: declared ${file.mimetype}, detected ${actual}`);
 *       }
 *     },
 *   },
 * });
 */
export function detectMimeType(data: Buffer): string | undefined {
  if (!data || data.length === 0) return undefined;

  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset || 0;
    if (offset + sig.bytes.length > data.length) continue;

    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (data[offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mimeType;
  }

  // RIFF container: bytes 0-3 = 'RIFF', bytes 8-11 = sub-format
  if (data.length >= 12 &&
      data[0] === 0x52 && data[1] === 0x49 &&
      data[2] === 0x46 && data[3] === 0x46) {
    const sub = data.subarray(8, 12).toString('ascii');
    switch (sub) {
      case 'WEBP': return 'image/webp';
      case 'WAVE': return 'audio/wav';
      case 'AVI ': return 'video/x-msvideo';
    }
  }

  return undefined;
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
  /** Pass an AbortSignal to cancel remaining work mid-flight. */
  signal?: AbortSignal | undefined;
}

/**
 * Processes an array with a concurrency limit.
 * 
 * Prevents overwhelming APIs or running out of resources by limiting
 * how many operations run at once.
 * 
 * Uses a shared-index work-stealing approach: workers pull the next
 * available item as soon as they finish one, ensuring even load
 * distribution regardless of per-item processing time.
 * 
 * @example
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
  const { maxConcurrent = 10, signal } = options;
  
  if (items.length === 0) {
    return [];
  }
  
  signal?.throwIfAborted();
  
  const itemsCopy = [...items];
  const itemCount = itemsCopy.length;
  
  if (itemCount <= maxConcurrent) {
    return Promise.all(itemsCopy.map((item, index) => operation(item, index)));
  }
  
  const results: R[] = new Array(itemCount);
  const workerCount = Math.min(maxConcurrent, itemCount);
  let nextIndex = 0;
  
  const createWorker = async (): Promise<void> => {
    while (nextIndex < itemCount) {
      signal?.throwIfAborted();
      const index = nextIndex++;
      if (index >= itemCount) break;
      const item = itemsCopy[index];
      if (item !== undefined) {
        results[index] = await operation(item, index);
      }
    }
  };
  
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(createWorker());
  }
  
  await Promise.all(workers);
  return results;
}
