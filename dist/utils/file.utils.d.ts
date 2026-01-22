/**
 * Generate unique filename with unix timestamp
 */
export declare function generateUniqueFileName(originalName: string): string;
/**
 * Sanitize filename to prevent security issues
 */
export declare function sanitizeFileName(fileName: string): string;
/**
 * Create month-based directory path
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
//# sourceMappingURL=file.utils.d.ts.map