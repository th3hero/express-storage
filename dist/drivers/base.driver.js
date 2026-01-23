import fs from 'fs';
import { generateUniqueFileName } from '../utils/file.utils.js';
/**
 * Abstract base class for all storage drivers
 */
export class BaseStorageDriver {
    constructor(config) {
        this.config = config;
    }
    /**
     * Upload multiple files in parallel with optional metadata
     */
    async uploadMultiple(files, options) {
        return Promise.all(files.map(file => this.upload(file, options).catch(error => ({
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed',
        }))));
    }
    /**
     * Generate multiple upload URLs in parallel with optional constraints
     */
    async generateMultipleUploadUrls(files) {
        return Promise.all(files.map(file => this.generateUploadUrl(file.fileName, file.contentType, file.fileSize).catch(error => ({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate upload URL',
        }))));
    }
    /**
     * Generate multiple view URLs in parallel
     */
    async generateMultipleViewUrls(fileNames) {
        return Promise.all(fileNames.map(fileName => this.generateViewUrl(fileName).catch(error => ({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate view URL',
        }))));
    }
    /**
     * Delete multiple files in parallel
     * Returns detailed results including error messages for failed deletions
     */
    async deleteMultiple(fileNames) {
        return Promise.all(fileNames.map(async (fileName) => {
            try {
                const success = await this.delete(fileName);
                const result = { success, fileName };
                if (!success) {
                    result.error = 'File not found or already deleted';
                }
                return result;
            }
            catch (error) {
                return {
                    success: false,
                    fileName,
                    error: error instanceof Error ? error.message : 'Failed to delete file',
                };
            }
        }));
    }
    /**
     * Generate unique filename with timestamp
     */
    generateFileName(originalName) {
        return generateUniqueFileName(originalName);
    }
    /**
     * Create success result
     */
    createSuccessResult(fileName, fileUrl) {
        const result = {
            success: true,
            fileName,
        };
        if (fileUrl) {
            result.fileUrl = fileUrl;
        }
        return result;
    }
    /**
     * Create error result
     */
    createErrorResult(error) {
        return {
            success: false,
            error,
        };
    }
    /**
     * Create presigned success result
     */
    createPresignedSuccessResult(uploadUrl, viewUrl) {
        const result = {
            success: true,
        };
        if (uploadUrl) {
            result.uploadUrl = uploadUrl;
        }
        if (viewUrl) {
            result.viewUrl = viewUrl;
        }
        return result;
    }
    /**
     * Create presigned error result
     */
    createPresignedErrorResult(error) {
        return {
            success: false,
            error,
        };
    }
    /**
     * Validate file before upload
     * Supports both memory storage (buffer) and disk storage (path)
     */
    validateFile(file) {
        const errors = [];
        if (!file) {
            errors.push('No file provided');
            return errors;
        }
        if (!file.originalname) {
            errors.push('File must have an original name');
        }
        if (!file.mimetype) {
            errors.push('File must have a MIME type');
        }
        // Check for either buffer (memory storage) or path (disk storage)
        const hasBuffer = file.buffer && file.buffer.length > 0;
        const hasPath = typeof file.path === 'string' && file.path.length > 0;
        if (!hasBuffer && !hasPath) {
            errors.push('File must have either buffer (memory storage) or path (disk storage)');
        }
        return errors;
    }
    /**
     * Get file content from either buffer (memory storage) or disk (disk storage)
     * Supports both Multer storage configurations
     */
    getFileContent(file) {
        // Prefer buffer if available (memory storage)
        if (file.buffer && file.buffer.length > 0) {
            return file.buffer;
        }
        // Fall back to reading from disk (disk storage)
        if (file.path) {
            return fs.readFileSync(file.path);
        }
        throw new Error('File has neither buffer nor path - cannot read content');
    }
    /**
     * Get presigned URL expiry time
     */
    getPresignedUrlExpiry() {
        return this.config.presignedUrlExpiry || 600; // Default 10 minutes
    }
    /**
     * Validate and confirm upload (for Azure post-upload validation)
     * Default implementation just generates view URL (S3/GCS validate at URL level)
     * Azure overrides this to check blob properties
     */
    async validateAndConfirmUpload(reference, _options) {
        // Default: just verify file exists by generating view URL
        const viewResult = await this.generateViewUrl(reference);
        if (viewResult.success) {
            const result = {
                success: true,
                reference,
                expiresIn: this.getPresignedUrlExpiry(),
            };
            if (viewResult.viewUrl) {
                result.viewUrl = viewResult.viewUrl;
            }
            return result;
        }
        return {
            success: false,
            error: viewResult.error || 'File not found',
        };
    }
}
//# sourceMappingURL=base.driver.js.map