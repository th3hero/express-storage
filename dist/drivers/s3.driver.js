import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BaseStorageDriver } from './base.driver.js';
/**
 * AWS S3 storage driver
 */
export class S3StorageDriver extends BaseStorageDriver {
    constructor(config) {
        super(config);
        this.bucketName = config.bucketName;
        this.region = config.awsRegion;
        // Build S3 client options
        const s3Options = {
            region: this.region,
        };
        // Only provide explicit credentials if access keys are provided
        // When running on AWS (EC2, ECS, Lambda, etc.), IAM roles are used automatically
        // via the default credential provider chain
        if (config.awsAccessKey && config.awsSecretKey) {
            s3Options.credentials = {
                accessKeyId: config.awsAccessKey,
                secretAccessKey: config.awsSecretKey,
            };
        }
        this.s3Client = new S3Client(s3Options);
    }
    /**
     * Upload file to S3 with optional metadata
     */
    async upload(file, options) {
        try {
            // Validate file
            const validationErrors = this.validateFile(file);
            if (validationErrors.length > 0) {
                return this.createErrorResult(validationErrors.join(', '));
            }
            // Generate unique filename
            const fileName = this.generateFileName(file.originalname);
            // Get file content (supports both memory and disk storage)
            const fileContent = this.getFileContent(file);
            // Build upload command with options
            const commandInput = {
                Bucket: this.bucketName,
                Key: fileName,
                Body: fileContent,
                ContentType: options?.contentType || file.mimetype,
                ContentLength: file.size,
            };
            // Add optional headers
            if (options?.cacheControl) {
                commandInput.CacheControl = options.cacheControl;
            }
            if (options?.contentDisposition) {
                commandInput.ContentDisposition = options.contentDisposition;
            }
            if (options?.metadata) {
                commandInput.Metadata = options.metadata;
            }
            const uploadCommand = new PutObjectCommand(commandInput);
            // Upload to S3
            await this.s3Client.send(uploadCommand);
            // Generate file URL
            const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fileName}`;
            return this.createSuccessResult(fileName, fileUrl);
        }
        catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : 'Failed to upload file to S3');
        }
    }
    /**
     * Generate presigned upload URL
     * @param fileName - Name of the file (will be the exact key in S3)
     * @param contentType - MIME type constraint (defaults to 'application/octet-stream' if not provided)
     * @param fileSize - Exact file size in bytes (enforced via ContentLength in signature)
     */
    async generateUploadUrl(fileName, contentType, fileSize) {
        try {
            // Default to 'application/octet-stream' if contentType not provided
            const resolvedContentType = contentType || 'application/octet-stream';
            // Build PutObject command with constraints
            const commandInput = {
                Bucket: this.bucketName,
                Key: fileName,
                ContentType: resolvedContentType,
            };
            // Add ContentLength if fileSize provided - this enforces exact file size
            if (fileSize) {
                commandInput.ContentLength = fileSize;
            }
            const uploadCommand = new PutObjectCommand(commandInput);
            const uploadUrl = await getSignedUrl(this.s3Client, uploadCommand, {
                expiresIn: this.getPresignedUrlExpiry(),
                signableHeaders: new Set(['content-type', 'content-length']),
            });
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
            const getCommand = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: fileName,
            });
            const viewUrl = await getSignedUrl(this.s3Client, getCommand, {
                expiresIn: this.getPresignedUrlExpiry(),
            });
            return this.createPresignedSuccessResult(undefined, viewUrl);
        }
        catch (error) {
            return this.createPresignedErrorResult(error instanceof Error ? error.message : 'Failed to generate view URL');
        }
    }
    /**
     * Delete file from S3
     * First verifies file exists, then deletes it
     */
    async delete(fileName) {
        try {
            // First check if file exists using HeadObject
            const headCommand = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: fileName,
            });
            try {
                await this.s3Client.send(headCommand);
            }
            catch {
                // File doesn't exist
                return false;
            }
            // File exists, proceed with deletion
            const deleteCommand = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: fileName,
            });
            await this.s3Client.send(deleteCommand);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Validate and confirm upload - verifies file exists and returns metadata
     */
    async validateAndConfirmUpload(reference, _options) {
        try {
            // Verify file exists with HeadObject
            const headCommand = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: reference,
            });
            const headResult = await this.s3Client.send(headCommand);
            // Generate view URL
            const viewResult = await this.generateViewUrl(reference);
            const result = {
                success: true,
                reference,
                expiresIn: this.getPresignedUrlExpiry(),
            };
            if (viewResult.viewUrl) {
                result.viewUrl = viewResult.viewUrl;
            }
            if (headResult.ContentType) {
                result.actualContentType = headResult.ContentType;
            }
            if (headResult.ContentLength !== undefined) {
                result.actualFileSize = headResult.ContentLength;
            }
            return result;
        }
        catch {
            return {
                success: false,
                error: 'File not found or access denied',
            };
        }
    }
    /**
     * List files in S3 bucket with optional prefix and pagination
     */
    async listFiles(prefix, maxResults = 1000, continuationToken) {
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: prefix,
                MaxKeys: maxResults,
                ContinuationToken: continuationToken,
            });
            const response = await this.s3Client.send(command);
            const files = (response.Contents || []).map(item => {
                const fileInfo = { name: item.Key || '' };
                if (item.Size !== undefined)
                    fileInfo.size = item.Size;
                if (item.LastModified)
                    fileInfo.lastModified = item.LastModified;
                return fileInfo;
            });
            const result = {
                success: true,
                files,
            };
            if (response.NextContinuationToken) {
                result.nextToken = response.NextContinuationToken;
            }
            return result;
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list files',
            };
        }
    }
}
/**
 * AWS S3 presigned storage driver
 */
export class S3PresignedStorageDriver extends S3StorageDriver {
    constructor(config) {
        super(config);
    }
    /**
     * Override upload to return presigned URL instead of direct upload
     * Includes content type and file size constraints for validation
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
            // Generate presigned upload URL with constraints
            const presignedResult = await this.generateUploadUrl(fileName, file.mimetype, // Pass content type for enforcement
            file.size // Pass file size for enforcement
            );
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
//# sourceMappingURL=s3.driver.js.map