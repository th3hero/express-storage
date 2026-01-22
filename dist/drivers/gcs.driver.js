import { Storage } from '@google-cloud/storage';
import { BaseStorageDriver } from './base.driver.js';
/**
 * Google Cloud Storage driver
 */
export class GCSStorageDriver extends BaseStorageDriver {
    constructor(config) {
        super(config);
        this.bucketName = config.bucketName;
        this.projectId = config.gcsProjectId;
        // Initialize GCS client
        const storageOptions = {
            projectId: this.projectId,
        };
        if (config.gcsCredentials) {
            storageOptions.keyFilename = config.gcsCredentials;
        }
        this.storage = new Storage(storageOptions);
        this.bucket = this.storage.bucket(this.bucketName);
    }
    /**
     * Upload file to GCS
     */
    async upload(file) {
        try {
            // Validate file
            const validationErrors = this.validateFile(file);
            if (validationErrors.length > 0) {
                return this.createErrorResult(validationErrors.join(', '));
            }
            // Generate unique filename
            const fileName = this.generateFileName(file.originalname);
            // Create file reference
            const gcsFile = this.bucket.file(fileName);
            // Upload file
            await gcsFile.save(file.buffer, {
                metadata: {
                    contentType: file.mimetype,
                },
            });
            // Generate file URL
            const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
            return this.createSuccessResult(fileName, fileUrl);
        }
        catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : 'Failed to upload file to GCS');
        }
    }
    /**
     * Generate presigned upload URL
     * @param fileName - The name of the file to upload
     * @param contentType - Optional content type constraint
     * @param _maxSize - Optional max file size (GCS doesn't support size limits in signed URLs)
     */
    async generateUploadUrl(fileName, contentType, _maxSize) {
        try {
            const gcsFile = this.bucket.file(fileName);
            // Build signed URL options
            const options = {
                version: 'v4',
                action: 'write',
                expires: Date.now() + (this.getPresignedUrlExpiry() * 1000),
            };
            // Only include contentType if specified - this makes the URL work with any content type
            // when contentType is not specified in the signature
            if (contentType) {
                options.contentType = contentType;
            }
            const [uploadUrl] = await gcsFile.getSignedUrl(options);
            return this.createPresignedSuccessResult(uploadUrl);
        }
        catch (error) {
            return this.createPresignedErrorResult(error instanceof Error ? error.message : 'Failed to generate upload URL');
        }
    }
    /**
     * Generate presigned view URL
     */
    async generateViewUrl(fileName) {
        try {
            const gcsFile = this.bucket.file(fileName);
            const [viewUrl] = await gcsFile.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + (this.getPresignedUrlExpiry() * 1000),
            });
            return this.createPresignedSuccessResult(undefined, viewUrl);
        }
        catch (error) {
            return this.createPresignedErrorResult(error instanceof Error ? error.message : 'Failed to generate view URL');
        }
    }
    /**
     * Delete file from GCS
     */
    async delete(fileName) {
        try {
            const gcsFile = this.bucket.file(fileName);
            await gcsFile.delete();
            return true;
        }
        catch {
            return false;
        }
    }
}
/**
 * Google Cloud Storage presigned driver
 */
export class GCSPresignedStorageDriver extends GCSStorageDriver {
    constructor(config) {
        super(config);
    }
    /**
     * Override upload to return presigned URL instead of direct upload
     */
    async upload(file) {
        try {
            // Validate file
            const validationErrors = this.validateFile(file);
            if (validationErrors.length > 0) {
                return this.createErrorResult(validationErrors.join(', '));
            }
            // Generate unique filename
            const fileName = this.generateFileName(file.originalname);
            // Generate presigned upload URL
            const presignedResult = await this.generateUploadUrl(fileName);
            if (!presignedResult.success) {
                return this.createErrorResult(presignedResult.error || 'Failed to generate presigned URL');
            }
            return this.createSuccessResult(fileName, presignedResult.uploadUrl);
        }
        catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : 'Failed to generate presigned URL');
        }
    }
}
//# sourceMappingURL=gcs.driver.js.map