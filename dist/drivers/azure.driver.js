import { BlobServiceClient, StorageSharedKeyCredential, BlobSASPermissions, generateBlobSASQueryParameters, } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { BaseStorageDriver } from './base.driver.js';
/**
 * Azure Blob Storage driver
 *
 * Supports three authentication methods:
 * 1. Connection string (recommended for simplicity)
 * 2. Account name + Account key (for more control)
 * 3. Default Azure Credentials / Managed Identity (for Azure-hosted apps)
 *
 * Note: SAS URL generation requires account key (options 1 or 2).
 * Managed Identity (option 3) supports direct upload/download but not presigned URLs.
 */
export class AzureStorageDriver extends BaseStorageDriver {
    constructor(config) {
        super(config);
        this.containerName = config.azureContainerName || config.bucketName;
        this.accountName = '';
        // Initialize Azure client based on available credentials
        if (config.azureConnectionString) {
            // Option 1: Connection string (simplest)
            this.blobServiceClient = BlobServiceClient.fromConnectionString(config.azureConnectionString);
            // Extract account name from connection string
            const match = config.azureConnectionString.match(/AccountName=([^;]+)/);
            if (match && match[1]) {
                this.accountName = match[1];
            }
            // Extract account key for SAS generation
            const keyMatch = config.azureConnectionString.match(/AccountKey=([^;]+)/);
            if (keyMatch && keyMatch[1]) {
                this.accountKey = keyMatch[1];
            }
        }
        else if (config.azureAccountName && config.azureAccountKey) {
            // Option 2: Account name + key
            this.accountName = config.azureAccountName;
            this.accountKey = config.azureAccountKey;
            const sharedKeyCredential = new StorageSharedKeyCredential(config.azureAccountName, config.azureAccountKey);
            this.blobServiceClient = new BlobServiceClient(`https://${config.azureAccountName}.blob.core.windows.net`, sharedKeyCredential);
        }
        else if (config.azureAccountName) {
            // Option 3: Default Azure credentials (Managed Identity, Azure CLI, etc.)
            // This works when deployed on Azure (App Service, Functions, VMs with managed identity)
            // or locally with Azure CLI authentication
            this.accountName = config.azureAccountName;
            this.blobServiceClient = new BlobServiceClient(`https://${config.azureAccountName}.blob.core.windows.net`, new DefaultAzureCredential());
        }
        else {
            throw new Error('Azure configuration requires either AZURE_CONNECTION_STRING, AZURE_ACCOUNT_NAME + AZURE_ACCOUNT_KEY, or AZURE_ACCOUNT_NAME (for Managed Identity)');
        }
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    }
    /**
     * Upload file to Azure Blob Storage with optional metadata
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
            // Get blob client
            const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
            // Build upload options
            const uploadOptions = {
                blobHTTPHeaders: {
                    blobContentType: options?.contentType || file.mimetype,
                },
            };
            if (options?.cacheControl) {
                uploadOptions.blobHTTPHeaders.blobCacheControl = options.cacheControl;
            }
            if (options?.contentDisposition) {
                uploadOptions.blobHTTPHeaders.blobContentDisposition = options.contentDisposition;
            }
            if (options?.metadata) {
                uploadOptions.metadata = options.metadata;
            }
            // Get file content (supports both memory and disk storage)
            const fileContent = this.getFileContent(file);
            // Upload file
            await blockBlobClient.uploadData(fileContent, uploadOptions);
            // Generate file URL
            const fileUrl = blockBlobClient.url;
            return this.createSuccessResult(fileName, fileUrl);
        }
        catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : 'Failed to upload file to Azure');
        }
    }
    /**
     * Generate presigned upload URL (SAS URL)
     * @param fileName - Name of the file
     * @param contentType - MIME type (defaults to 'application/octet-stream' if not provided)
     * @param _fileSize - File size in bytes (Azure SAS doesn't support size enforcement - informational only)
     */
    async generateUploadUrl(fileName, contentType, _fileSize) {
        try {
            if (!this.accountKey) {
                return this.createPresignedErrorResult('Account key is required for generating SAS URLs. Use connection string or provide AZURE_ACCOUNT_KEY.');
            }
            const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
            const expiresOn = new Date(Date.now() + (this.getPresignedUrlExpiry() * 1000));
            // Default to 'application/octet-stream' if contentType not provided
            const resolvedContentType = contentType || 'application/octet-stream';
            // Build SAS options
            const sasOptions = {
                containerName: this.containerName,
                blobName: fileName,
                permissions: BlobSASPermissions.parse('cw'), // create and write
                expiresOn,
                contentType: resolvedContentType,
            };
            const sasToken = generateBlobSASQueryParameters(sasOptions, new StorageSharedKeyCredential(this.accountName, this.accountKey)).toString();
            const uploadUrl = `${blockBlobClient.url}?${sasToken}`;
            return this.createPresignedSuccessResult(uploadUrl);
        }
        catch (error) {
            return this.createPresignedErrorResult(error instanceof Error ? error.message : 'Failed to generate upload URL');
        }
    }
    /**
     * Generate presigned view URL (SAS URL)
     */
    async generateViewUrl(fileName) {
        try {
            if (!this.accountKey) {
                return this.createPresignedErrorResult('Account key is required for generating SAS URLs. Use connection string or provide AZURE_ACCOUNT_KEY.');
            }
            const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
            const expiresOn = new Date(Date.now() + (this.getPresignedUrlExpiry() * 1000));
            const sasToken = generateBlobSASQueryParameters({
                containerName: this.containerName,
                blobName: fileName,
                permissions: BlobSASPermissions.parse('r'), // read only
                expiresOn,
            }, new StorageSharedKeyCredential(this.accountName, this.accountKey)).toString();
            const viewUrl = `${blockBlobClient.url}?${sasToken}`;
            return this.createPresignedSuccessResult(undefined, viewUrl);
        }
        catch (error) {
            return this.createPresignedErrorResult(error instanceof Error ? error.message : 'Failed to generate view URL');
        }
    }
    /**
     * Delete file from Azure Blob Storage
     * First verifies file exists, then deletes it
     */
    async delete(fileName) {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
            // Check if blob exists first
            const exists = await blockBlobClient.exists();
            if (!exists) {
                return false;
            }
            await blockBlobClient.delete();
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Validate and confirm upload - Azure-specific implementation
     * Checks actual blob properties against expected values
     * Deletes blob if validation fails
     */
    async validateAndConfirmUpload(reference, options) {
        // Default to deleting on failure for backwards compatibility
        const deleteOnFailure = options?.deleteOnFailure !== false;
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(reference);
            // Get blob properties
            const properties = await blockBlobClient.getProperties();
            const actualContentType = properties.contentType;
            const actualFileSize = properties.contentLength;
            // Validate content type if expected
            if (options?.expectedContentType && actualContentType !== options.expectedContentType) {
                // Optionally delete the invalid blob
                if (deleteOnFailure) {
                    await this.delete(reference);
                }
                const errorResult = {
                    success: false,
                    error: `Content type mismatch: expected '${options.expectedContentType}', got '${actualContentType}'${deleteOnFailure ? ' (blob deleted)' : ' (blob kept for inspection)'}`,
                };
                if (actualContentType)
                    errorResult.actualContentType = actualContentType;
                if (actualFileSize !== undefined)
                    errorResult.actualFileSize = actualFileSize;
                return errorResult;
            }
            // Validate file size if expected
            if (options?.expectedFileSize !== undefined && actualFileSize !== options.expectedFileSize) {
                // Optionally delete the invalid blob
                if (deleteOnFailure) {
                    await this.delete(reference);
                }
                const errorResult = {
                    success: false,
                    error: `File size mismatch: expected ${options.expectedFileSize} bytes, got ${actualFileSize} bytes${deleteOnFailure ? ' (blob deleted)' : ' (blob kept for inspection)'}`,
                };
                if (actualContentType)
                    errorResult.actualContentType = actualContentType;
                if (actualFileSize !== undefined)
                    errorResult.actualFileSize = actualFileSize;
                return errorResult;
            }
            // Validation passed - generate view URL
            const viewResult = await this.generateViewUrl(reference);
            const successResult = {
                success: true,
                reference,
                expiresIn: this.getPresignedUrlExpiry(),
            };
            if (viewResult.viewUrl)
                successResult.viewUrl = viewResult.viewUrl;
            if (actualContentType)
                successResult.actualContentType = actualContentType;
            if (actualFileSize !== undefined)
                successResult.actualFileSize = actualFileSize;
            return successResult;
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to validate upload',
            };
        }
    }
    /**
     * List files in Azure container with optional prefix and pagination
     */
    async listFiles(prefix, maxResults = 1000, continuationToken) {
        try {
            const files = [];
            let nextToken;
            // Build options conditionally
            const listOptions = {};
            if (prefix)
                listOptions.prefix = prefix;
            const pageOptions = {
                maxPageSize: maxResults,
            };
            if (continuationToken)
                pageOptions.continuationToken = continuationToken;
            const iterator = this.containerClient.listBlobsFlat(listOptions)
                .byPage(pageOptions);
            // Get first page only
            const page = await iterator.next();
            if (!page.done && page.value) {
                for (const blob of page.value.segment.blobItems) {
                    const fileInfo = { name: blob.name };
                    if (blob.properties.contentLength !== undefined) {
                        fileInfo.size = blob.properties.contentLength;
                    }
                    if (blob.properties.contentType) {
                        fileInfo.contentType = blob.properties.contentType;
                    }
                    if (blob.properties.lastModified) {
                        fileInfo.lastModified = blob.properties.lastModified;
                    }
                    files.push(fileInfo);
                }
                nextToken = page.value.continuationToken;
            }
            const result = {
                success: true,
                files,
            };
            if (nextToken) {
                result.nextToken = nextToken;
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
 * Azure Blob Storage presigned driver
 * Requires account key for SAS URL generation (Managed Identity is not supported)
 */
export class AzurePresignedStorageDriver extends AzureStorageDriver {
    constructor(config) {
        super(config);
        // Verify account key is available for SAS generation
        // This check happens at initialization to fail fast rather than at runtime
        if (!this.hasAccountKey()) {
            throw new Error('AzurePresignedStorageDriver requires an account key for SAS URL generation. ' +
                'Use AZURE_CONNECTION_STRING or provide both AZURE_ACCOUNT_NAME and AZURE_ACCOUNT_KEY. ' +
                'Managed Identity cannot be used with presigned URLs - use the regular "azure" driver instead.');
        }
    }
    /**
     * Check if account key is available for SAS generation
     */
    hasAccountKey() {
        // accountKey is set in parent constructor from connection string or explicit key
        return this['accountKey'] !== undefined;
    }
    /**
     * Override upload to return presigned URL instead of direct upload
     * Note: Azure SAS URLs don't enforce content type or file size at URL level
     * Use validateAndConfirmUpload() after upload for validation
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
            // Generate presigned upload URL with content type (informational for Azure)
            const presignedResult = await this.generateUploadUrl(fileName, file.mimetype, // Pass content type (informational only for Azure)
            file.size // Pass file size (informational only for Azure)
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
//# sourceMappingURL=azure.driver.js.map