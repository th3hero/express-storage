import path from 'path';
import fs from 'fs';

/**
 * Generate unique filename with unix timestamp (milliseconds), random suffix, and sanitized original name
 * Format: {timestamp}_{random}_{sanitized_name}.{extension} e.g., 1769104576000_a1b2c3_my_image.jpeg
 * Random suffix prevents collisions in high-throughput scenarios
 */
export function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now(); // Unix timestamp in milliseconds
  const randomSuffix = Math.random().toString(36).substring(2, 8); // 6 char random string
  const extension = path.extname(originalName).toLowerCase();
  const sanitizedName = sanitizeFileName(originalName);
  let baseName = path.basename(sanitizedName, path.extname(sanitizedName));
  
  // Ensure baseName is not empty (handles files with only special chars or no name)
  if (!baseName || baseName.trim() === '') {
    baseName = 'file';
  }
  
  return `${timestamp}_${randomSuffix}_${baseName}${extension}`;
}

/**
 * Sanitize filename to prevent security issues
 * Returns 'file' if sanitization produces empty string
 */
export function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special characters with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  
  // Return default name if sanitization produces empty string
  return sanitized || 'file';
}

/**
 * Validate filename for security and compatibility
 * Returns error message if invalid, null if valid
 */
export function validateFileName(fileName: string): string | null {
  if (!fileName || typeof fileName !== 'string') {
    return 'Filename is required';
  }
  
  const trimmed = fileName.trim();
  if (trimmed.length === 0) {
    return 'Filename cannot be empty';
  }
  
  // Check for extremely long filenames (most filesystems limit to 255 bytes)
  if (trimmed.length > 255) {
    return 'Filename is too long (max 255 characters)';
  }
  
  // Check for path traversal
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return 'Filename cannot contain path separators or traversal sequences';
  }
  
  // Check for null bytes
  if (trimmed.includes('\0')) {
    return 'Filename cannot contain null bytes';
  }
  
  return null;
}

/**
 * Create date-based directory path
 * Format: YYYY/MM (e.g., 2026/01) for better sorting and shorter paths
 */
export function createMonthBasedPath(basePath: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 01-12
  
  return path.join(basePath, year.toString(), month);
}

/**
 * Ensure directory exists, create if it doesn't
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validate file size
 */
export function validateFileSize(fileSize: number, maxSize: number): boolean {
  return fileSize <= maxSize;
}

/**
 * Validate file type
 */
export function validateFileType(mimeType: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(mimeType);
}

/**
 * Create relative URL for local files
 */
export function createLocalFileUrl(filePath: string, baseUrl: string = ''): string {
  const relativePath = filePath.replace(/^public\//, '');
  return `${baseUrl}/${relativePath}`.replace(/\/+/g, '/');
}

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

/**
 * Check if file is an image
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Check if file is a document
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
 * Retry options for cloud operations
 */
export interface RetryOptions {
  /**
   * Maximum number of total attempts (including initial attempt)
   * Default: 3 (1 initial + 2 retries)
   * @example maxAttempts: 4 means 1 initial attempt + 3 retries
   */
  maxAttempts?: number;
  baseDelay?: number;       // Base delay in ms between retries (default: 1000)
  maxDelay?: number;        // Maximum delay in ms (default: 10000)
  exponentialBackoff?: boolean; // Use exponential backoff (default: true)
}

/**
 * Execute an async operation with retry logic
 * Uses exponential backoff by default
 * 
 * @param operation - Async function to execute
 * @param options - Retry configuration options
 * @returns Result of the operation
 * @throws Last error if all attempts fail
 * 
 * @example
 * // 3 total attempts (default)
 * await withRetry(() => fetchData());
 * 
 * // 5 total attempts (1 initial + 4 retries)
 * await withRetry(() => fetchData(), { maxAttempts: 5 });
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
      
      // Don't wait after the last attempt
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
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, ms));
}