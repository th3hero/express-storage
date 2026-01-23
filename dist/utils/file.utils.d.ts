/**
 * Generate unique filename with unix timestamp (milliseconds), random suffix, and sanitized original name
 * Format: {timestamp}_{random}_{sanitized_name}.{extension} e.g., 1769104576000_a1b2c3_my_image.jpeg
 * Random suffix prevents collisions in high-throughput scenarios
 */
export declare function generateUniqueFileName(originalName: string): string;
/**
 * Sanitize filename to prevent security issues
 * Returns 'file' if sanitization produces empty string
 */
export declare function sanitizeFileName(fileName: string): string;
/**
 * Validate filename for security and compatibility
 * Returns error message if invalid, null if valid
 */
export declare function validateFileName(fileName: string): string | null;
/**
 * Create date-based directory path
 * Format: YYYY/MM (e.g., 2026/01) for better sorting and shorter paths
 */
export declare function createMonthBasedPath(basePath: string): string;
/**
 * Ensure directory exists, create if it doesn't
 */
export declare function ensureDirectoryExists(dirPath: string): void;
/**
 * Get file size in human readable format
 */
export declare function formatFileSize(bytes: number): string;
/**
 * Validate file size
 */
export declare function validateFileSize(fileSize: number, maxSize: number): boolean;
/**
 * Validate file type
 */
export declare function validateFileType(mimeType: string, allowedTypes: string[]): boolean;
/**
 * Create relative URL for local files
 */
export declare function createLocalFileUrl(filePath: string, baseUrl?: string): string;
/**
 * Get file extension from filename
 */
export declare function getFileExtension(fileName: string): string;
/**
 * Check if file is an image
 */
export declare function isImageFile(mimeType: string): boolean;
/**
 * Check if file is a document
 */
export declare function isDocumentFile(mimeType: string): boolean;
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
    baseDelay?: number;
    maxDelay?: number;
    exponentialBackoff?: boolean;
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
export declare function withRetry<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>;
/**
 * Sleep for specified milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
//# sourceMappingURL=file.utils.d.ts.map