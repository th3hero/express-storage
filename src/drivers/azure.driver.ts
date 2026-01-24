import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo } from '../types/storage.types.js';

/**
 * AzureStorageDriver - Handles file operations with Azure Blob Storage.
 * 
 * Supports three authentication methods:
 * 1. Connection string (simplest — recommended for getting started)
 * 2. Account name + Account key (more control)
 * 3. Managed Identity (when running on Azure — no secrets needed!)
 * 
 * Important: SAS URL generation requires an account key.
 * Managed Identity works great for direct uploads but can't create presigned URLs.
 */
export class AzureStorageDriver extends BaseStorageDriver {
  private blobServiceClient: BlobServiceClient;
  protected containerClient: ContainerClient;
  private containerName: string;
  protected accountName: string;
  protected accountKey?: string;

  constructor(config: StorageConfig) {
    super(config);
    
    this.containerName = config.azureContainerName || config.bucketName || '';
    if (!this.containerName) {
      throw new Error('Azure container name is required. Set AZURE_CONTAINER_NAME or BUCKET_NAME.');
    }
    this.accountName = '';
    
    if (config.azureConnectionString) {
      // Method 1: Connection string
      this.blobServiceClient = BlobServiceClient.fromConnectionString(config.azureConnectionString);
      
      const accountNameMatch = config.azureConnectionString.match(/AccountName=([a-z0-9]{3,24})(?:;|$)/i);
      if (accountNameMatch && accountNameMatch[1]) {
        this.accountName = accountNameMatch[1].toLowerCase();
      } else {
        throw new Error(
          'Could not extract AccountName from Azure connection string. ' +
          'Ensure the connection string contains "AccountName=<name>" where name is 3-24 lowercase letters/numbers.'
        );
      }
      
      const keyMatch = config.azureConnectionString.match(/AccountKey=([A-Za-z0-9+/=]{20,})(?:;|$)/);
      if (keyMatch && keyMatch[1]) {
        this.accountKey = keyMatch[1];
      }
    } else if (config.azureAccountName && config.azureAccountKey) {
      // Method 2: Account name + key
      this.accountName = config.azureAccountName;
      this.accountKey = config.azureAccountKey;
      const sharedKeyCredential = new StorageSharedKeyCredential(
        config.azureAccountName,
        config.azureAccountKey
      );
      this.blobServiceClient = new BlobServiceClient(
        `https://${config.azureAccountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
    } else if (config.azureAccountName) {
      // Method 3: Managed Identity
      this.accountName = config.azureAccountName;
      this.blobServiceClient = new BlobServiceClient(
        `https://${config.azureAccountName}.blob.core.windows.net`,
        new DefaultAzureCredential()
      );
    } else {
      throw new Error('Azure configuration requires either AZURE_CONNECTION_STRING, AZURE_ACCOUNT_NAME + AZURE_ACCOUNT_KEY, or AZURE_ACCOUNT_NAME (for Managed Identity)');
    }
    
    this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
  }

  /**
   * Uploads a file directly to Azure Blob Storage.
   * Handles both memory and disk storage from Multer.
   * 
   * For large files (>100MB), uses streaming upload to reduce
   * memory usage and improve reliability.
   */
  async upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult> {
    try {
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '));
      }

      const fileName = this.generateFileName(file.originalname);
      const blobPath = this.buildFilePath(fileName);
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobPath);
      
      const uploadOptions: {
        blobHTTPHeaders: {
          blobContentType: string;
          blobCacheControl?: string;
          blobContentDisposition?: string;
        };
        metadata?: Record<string, string>;
      } = {
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

      // Use streaming upload for large files to reduce memory usage
      if (this.shouldUseStreaming(file)) {
        const fileStream = this.getFileStream(file);
        const streamOptions: {
          blobHTTPHeaders: typeof uploadOptions.blobHTTPHeaders;
          metadata?: Record<string, string>;
        } = {
          blobHTTPHeaders: uploadOptions.blobHTTPHeaders,
        };
        if (uploadOptions.metadata) {
          streamOptions.metadata = uploadOptions.metadata;
        }
        await blockBlobClient.uploadStream(
          fileStream,
          4 * 1024 * 1024, // 4MB buffer size
          4, // 4 concurrent uploads
          streamOptions
        );
      } else {
        const fileContent = this.getFileContent(file);
        await blockBlobClient.uploadData(fileContent, uploadOptions);
      }
      
      // Build the public URL with proper encoding
      const encodedPath = blobPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
      const fileUrl = `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${encodedPath}`;
      
      return this.createSuccessResult(blobPath, fileUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file to Azure'
      );
    }
  }

  /**
   * Creates a SAS URL for uploading directly to Azure.
   * 
   * Important: Unlike S3 and GCS, Azure SAS URLs do NOT enforce file size
   * or content type. Always call validateAndConfirmUpload() after the
   * client uploads to verify the file is what you expected.
   */
  async generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult> {
    // Security: Defense-in-depth validation (StorageManager also validates)
    if (fileName.includes('..') || fileName.includes('\0')) {
      return this.createPresignedErrorResult('Invalid fileName: path traversal sequences are not allowed');
    }

    // Warn developers that fileSize is not enforced by Azure (unlike S3/GCS)
    if (fileSize !== undefined && process.env['NODE_ENV'] !== 'production') {
      console.warn(
        '[express-storage] Azure SAS URLs do not enforce fileSize constraints. ' +
        'The provided fileSize (%d bytes) is recorded but not enforced at upload time. ' +
        'Always call validateAndConfirmUpload() with expectedFileSize to verify the uploaded file.',
        fileSize
      );
    }
    
    try {
      if (!this.accountKey) {
        return this.createPresignedErrorResult(
          'Account key is required for generating SAS URLs. Use connection string or provide AZURE_ACCOUNT_KEY.'
        );
      }

      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const expiresOn = new Date(Date.now() + (this.getPresignedUrlExpiry() * 1000));
      const resolvedContentType = contentType || 'application/octet-stream';
      
      const sasOptions: {
        containerName: string;
        blobName: string;
        permissions: BlobSASPermissions;
        expiresOn: Date;
        contentType: string;
      } = {
        containerName: this.containerName,
        blobName: fileName,
        permissions: BlobSASPermissions.parse('cw'),
        expiresOn,
        contentType: resolvedContentType,
      };
      
      const sasToken = generateBlobSASQueryParameters(
        sasOptions,
        new StorageSharedKeyCredential(this.accountName, this.accountKey)
      ).toString();

      const uploadUrl = `${blockBlobClient.url}?${sasToken}`;

      return this.createPresignedSuccessResult(uploadUrl);
    } catch (error) {
      return this.createPresignedErrorResult(
        error instanceof Error ? error.message : 'Failed to generate upload URL'
      );
    }
  }

  /**
   * Creates a SAS URL for downloading/viewing a file.
   */
  async generateViewUrl(fileName: string): Promise<PresignedUrlResult> {
    // Security: Defense-in-depth validation
    if (fileName.includes('..') || fileName.includes('\0')) {
      return this.createPresignedErrorResult('Invalid fileName: path traversal sequences are not allowed');
    }
    
    try {
      if (!this.accountKey) {
        return this.createPresignedErrorResult(
          'Account key is required for generating SAS URLs. Use connection string or provide AZURE_ACCOUNT_KEY.'
        );
      }

      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const expiresOn = new Date(Date.now() + (this.getPresignedUrlExpiry() * 1000));
      
      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerName,
          blobName: fileName,
          permissions: BlobSASPermissions.parse('r'),
          expiresOn,
        },
        new StorageSharedKeyCredential(this.accountName, this.accountKey)
      ).toString();

      const viewUrl = `${blockBlobClient.url}?${sasToken}`;

      return this.createPresignedSuccessResult(undefined, viewUrl);
    } catch (error) {
      return this.createPresignedErrorResult(
        error instanceof Error ? error.message : 'Failed to generate view URL'
      );
    }
  }

  /**
   * Deletes a file from Azure Blob Storage.
   * Returns false if the file doesn't exist, throws on real errors.
   */
  async delete(fileName: string): Promise<boolean> {
    // Security: Defense-in-depth validation
    if (fileName.includes('..') || fileName.includes('\0')) {
      return false;
    }
    
    const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
    
    const exists = await blockBlobClient.exists();
    if (!exists) {
      return false;
    }
    
    await blockBlobClient.delete();
    return true;
  }

  /**
   * Validates an upload against expected values and deletes invalid files.
   * 
   * This is CRITICAL for Azure presigned uploads because Azure doesn't
   * enforce constraints at the URL level. Someone could upload a 10GB
   * executable when you expected a 1MB image.
   * 
   * Always call this after presigned uploads with your expected values.
   */
  override async validateAndConfirmUpload(
    reference: string, 
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    const deleteOnFailure = options?.deleteOnFailure !== false;
    
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(reference);
      const properties = await blockBlobClient.getProperties();
      
      const actualContentType = properties.contentType;
      const actualFileSize = properties.contentLength;

      // Validate content type if expected
      if (options?.expectedContentType && actualContentType !== options.expectedContentType) {
        if (deleteOnFailure) {
          await this.delete(reference);
        }
        const errorResult: BlobValidationResult = {
          success: false,
          error: `Content type mismatch: expected '${options.expectedContentType}', got '${actualContentType}'${deleteOnFailure ? ' (file deleted)' : ' (file kept for inspection)'}`,
        };
        if (actualContentType) errorResult.actualContentType = actualContentType;
        if (actualFileSize !== undefined) errorResult.actualFileSize = actualFileSize;
        return errorResult;
      }

      // Validate file size if expected
      if (options?.expectedFileSize !== undefined && actualFileSize !== options.expectedFileSize) {
        if (deleteOnFailure) {
          await this.delete(reference);
        }
        const errorResult: BlobValidationResult = {
          success: false,
          error: `File size mismatch: expected ${options.expectedFileSize} bytes, got ${actualFileSize} bytes${deleteOnFailure ? ' (file deleted)' : ' (file kept for inspection)'}`,
        };
        if (actualContentType) errorResult.actualContentType = actualContentType;
        if (actualFileSize !== undefined) errorResult.actualFileSize = actualFileSize;
        return errorResult;
      }

      const viewResult = await this.generateViewUrl(reference);

      const successResult: BlobValidationResult = {
        success: true,
        reference,
        expiresIn: this.getPresignedUrlExpiry(),
      };
      if (viewResult.viewUrl) successResult.viewUrl = viewResult.viewUrl;
      if (actualContentType) successResult.actualContentType = actualContentType;
      if (actualFileSize !== undefined) successResult.actualFileSize = actualFileSize;
      
      return successResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate upload',
      };
    }
  }

  /**
   * Lists files in the container with optional prefix filtering and pagination.
   */
  async listFiles(
    prefix?: string,
    maxResults: number = 1000,
    continuationToken?: string
  ): Promise<ListFilesResult> {
    try {
      const validatedMaxResults = Math.floor(Math.max(1, Math.min(
        Number.isNaN(maxResults) ? 1000 : maxResults, 
        1000
      )));
      
      const files: FileInfo[] = [];
      let nextToken: string | undefined;

      const listOptions: { prefix?: string } = {};
      if (prefix) listOptions.prefix = prefix;

      const pageOptions: { maxPageSize: number; continuationToken?: string } = {
        maxPageSize: validatedMaxResults,
      };
      if (continuationToken) pageOptions.continuationToken = continuationToken;

      const iterator = this.containerClient.listBlobsFlat(listOptions)
        .byPage(pageOptions);

      const page = await iterator.next();
      
      if (!page.done && page.value) {
        for (const blob of page.value.segment.blobItems) {
          const fileInfo: FileInfo = { name: blob.name };
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

      const result: ListFilesResult = {
        success: true,
        files,
      };

      if (nextToken) {
        result.nextToken = nextToken;
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
      };
    }
  }
}

/**
 * AzurePresignedStorageDriver - Azure driver that returns SAS URLs from upload().
 * 
 * Use this when you want clients to upload directly to Azure without
 * the file passing through your server.
 * 
 * Critical: Always call validateAndConfirmUpload() after clients upload!
 * Azure doesn't enforce any constraints on SAS URLs.
 */
export class AzurePresignedStorageDriver extends AzureStorageDriver {
  constructor(config: StorageConfig) {
    super(config);
    
    if (!this.hasAccountKey()) {
      throw new Error(
        'AzurePresignedStorageDriver requires an account key for SAS URL generation. ' +
        'Use AZURE_CONNECTION_STRING or provide both AZURE_ACCOUNT_NAME and AZURE_ACCOUNT_KEY. ' +
        'Managed Identity cannot be used with presigned URLs - use the regular "azure" driver instead.'
      );
    }
  }

  private hasAccountKey(): boolean {
    return this.accountKey !== undefined;
  }

  /**
   * Instead of uploading the file, returns a SAS URL for the client to use.
   * 
   * The returned fileUrl is the SAS upload URL.
   * After the client uploads, use validateAndConfirmUpload() to verify
   * the file and get a view URL.
   * 
   * Note: The `options` parameter (metadata, cacheControl, etc.) is NOT applied
   * when using presigned uploads. These options must be set by the client when
   * making the actual upload request to Azure, or configured via container settings.
   * For server-side uploads with full options support, use the regular 'azure' driver.
   */
  override async upload(file: Express.Multer.File, _options?: UploadOptions): Promise<FileUploadResult> {
    try {
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '));
      }

      const fileName = this.generateFileName(file.originalname);
      const filePath = this.buildFilePath(fileName);
      
      const presignedResult = await this.generateUploadUrl(
        filePath,
        file.mimetype,
        file.size
      );
      
      if (!presignedResult.success) {
        return this.createErrorResult(presignedResult.error || 'Failed to generate presigned URL');
      }

      return this.createSuccessResult(filePath, presignedResult.uploadUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to generate presigned URL'
      );
    }
  }
}
