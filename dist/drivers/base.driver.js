import { generateUniqueFileName } from '../utils/file.utils.js';
/**
 * Abstract base class for all storage drivers
 */
export class BaseStorageDriver {
    constructor(config) {
        this.config = config;
    }
    /**
     * Upload multiple files
     */
    async uploadMultiple(files) {
        const results = [];
        for (const file of files) {
            try {
                const result = await this.upload(file);
                results.push(result);
            }
            catch (error) {
                results.push({
                    success: false,
                    error: error instanceof Error ? error.message : 'Upload failed',
                });
            }
        }
        return results;
    }
    /**
     * Generate multiple upload URLs
     */
    async generateMultipleUploadUrls(fileNames) {
        const results = [];
        for (const fileName of fileNames) {
            try {
                const result = await this.generateUploadUrl(fileName);
                results.push(result);
            }
            catch (error) {
                results.push({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to generate upload URL',
                });
            }
        }
        return results;
    }
    /**
     * Generate multiple view URLs
     */
    async generateMultipleViewUrls(fileNames) {
        const results = [];
        for (const fileName of fileNames) {
            try {
                const result = await this.generateViewUrl(fileName);
                results.push(result);
            }
            catch (error) {
                results.push({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to generate view URL',
                });
            }
        }
        return results;
    }
    /**
     * Delete multiple files
     */
    async deleteMultiple(fileNames) {
        const results = [];
        for (const fileName of fileNames) {
            try {
                const result = await this.delete(fileName);
                results.push(result);
            }
            catch {
                results.push(false);
            }
        }
        return results;
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
        if (!file.buffer || file.buffer.length === 0) {
            errors.push('File buffer is empty');
        }
        return errors;
    }
    /**
     * Get presigned URL expiry time
     */
    getPresignedUrlExpiry() {
        return this.config.presignedUrlExpiry || 600; // Default 10 minutes
    }
}
//# sourceMappingURL=base.driver.js.map