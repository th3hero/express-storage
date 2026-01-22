import path from 'path';
import fs from 'fs';
/**
 * Generate unique filename with unix timestamp
 */
export function generateUniqueFileName(originalName) {
    const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp
    const extension = path.extname(originalName);
    const sanitizedName = sanitizeFileName(originalName);
    const baseName = path.basename(sanitizedName, extension);
    return `${timestamp}_${baseName}${extension}`;
}
/**
 * Sanitize filename to prevent security issues
 */
export function sanitizeFileName(fileName) {
    return fileName
        .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special characters with underscore
        .replace(/_{2,}/g, '_') // Replace multiple underscores with single
        .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
}
/**
 * Create month-based directory path
 */
export function createMonthBasedPath(basePath) {
    const now = new Date();
    const month = now.toLocaleString('en', { month: 'long' }).toLowerCase();
    const year = now.getFullYear();
    return path.join(basePath, month, year.toString());
}
/**
 * Ensure directory exists, create if it doesn't
 */
export function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
/**
 * Get file size in human readable format
 */
export function formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0)
        return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}
/**
 * Validate file size
 */
export function validateFileSize(fileSize, maxSize) {
    return fileSize <= maxSize;
}
/**
 * Validate file type
 */
export function validateFileType(mimeType, allowedTypes) {
    return allowedTypes.includes(mimeType);
}
/**
 * Create relative URL for local files
 */
export function createLocalFileUrl(filePath, baseUrl = '') {
    const relativePath = filePath.replace(/^public\//, '');
    return `${baseUrl}/${relativePath}`.replace(/\/+/g, '/');
}
/**
 * Get file extension from filename
 */
export function getFileExtension(fileName) {
    return path.extname(fileName).toLowerCase();
}
/**
 * Check if file is an image
 */
export function isImageFile(mimeType) {
    return mimeType.startsWith('image/');
}
/**
 * Check if file is a document
 */
export function isDocumentFile(mimeType) {
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
//# sourceMappingURL=file.utils.js.map