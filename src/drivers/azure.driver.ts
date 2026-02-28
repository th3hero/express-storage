import type {
  BlobServiceClient as BlobServiceClientType,
  ContainerClient as ContainerClientType,
} from '@azure/storage-blob';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo, DeleteResult } from '../types/storage.types.js';
import { encodePathSegments } from '../utils/file.utils.js';

// Lazy SDK loaders — modules are imported on first use, not at import time.

let _azureBlobMod: Promise<typeof import('@azure/storage-blob')> | undefined;
function loadAzureBlobSDK(): Promise<typeof import('@azure/storage-blob')> {
  if (!_azureBlobMod) {
    _azureBlobMod = import('@azure/storage-blob').catch(() => {
      _azureBlobMod = undefined;
      throw new Error(
        '@azure/storage-blob is required for Azure storage.\n' +
        'Install: npm install @azure/storage-blob @azure/identity'
      );
    });
  }
  return _azureBlobMod;
}

let _azureIdentityMod: Promise<typeof import('@azure/identity')> | undefined;
function loadAzureIdentity(): Promise<typeof import('@azure/identity')> {
  if (!_azureIdentityMod) {
    _azureIdentityMod = import('@azure/identity').catch(() => {
      _azureIdentityMod = undefined;
      throw new Error(
        '@azure/identity is required for Azure Managed Identity authentication.\n' +
        'Install: npm install @azure/identity'
      );
    });
  }
  return _azureIdentityMod;
}

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
 * 
 * When driver is 'azure-presigned', upload() returns SAS URLs instead of
 * uploading directly. Always call validateAndConfirmUpload() after client
 * uploads — Azure doesn't enforce constraints on SAS URLs.
 * 
 * Required packages: @azure/storage-blob, @azure/identity
 */
export class AzureStorageDriver extends BaseStorageDriver {
  private _blobServiceClient?: BlobServiceClientType | undefined;
  private _containerClient?: ContainerClientType | undefined;
  private readonly containerName: string;
  private readonly accountName: string;
  private readonly accountKey?: string;

  constructor(config: StorageConfig) {
    super(config);
    
    this.containerName = config.azureContainerName || config.bucketName || '';
    if (!this.containerName) {
      throw new Error('Azure container name is required. Set BUCKET_NAME environment variable or pass azureContainerName in credentials.');
    }
    this.accountName = '';

    if (config.azureConnectionString) {
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
    } else if (config.azureAccountName) {
      this.accountName = config.azureAccountName;
      if (config.azureAccountKey) {
        this.accountKey = config.azureAccountKey;
      }
    } else {
      throw new Error('Azure configuration requires either AZURE_CONNECTION_STRING, AZURE_ACCOUNT_NAME + AZURE_ACCOUNT_KEY, or AZURE_ACCOUNT_NAME (for Managed Identity)');
    }

    // Presigned mode requires an account key for SAS URL generation
    if (this.presignedMode && this.accountKey === undefined) {
      throw new Error(
        'Azure presigned mode requires an account key for SAS URL generation. ' +
        'Use AZURE_CONNECTION_STRING or provide both AZURE_ACCOUNT_NAME and AZURE_ACCOUNT_KEY. ' +
        'Managed Identity cannot be used with presigned URLs - use the regular "azure" driver instead.'
      );
    }
  }

  private async ensureContainerClient(): Promise<ContainerClientType> {
    if (this._containerClient) return this._containerClient;

    const azureBlob = await loadAzureBlobSDK();

    if (this.config.azureConnectionString) {
      this._blobServiceClient = azureBlob.BlobServiceClient.fromConnectionString(this.config.azureConnectionString);
    } else if (this.config.azureAccountName && this.config.azureAccountKey) {
      const sharedKeyCredential = new azureBlob.StorageSharedKeyCredential(
        this.config.azureAccountName,
        this.config.azureAccountKey
      );
      this._blobServiceClient = new azureBlob.BlobServiceClient(
        `https://${this.config.azureAccountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
    } else if (this.config.azureAccountName) {
      const azureIdentity = await loadAzureIdentity();
      this._blobServiceClient = new azureBlob.BlobServiceClient(
        `https://${this.config.azureAccountName}.blob.core.windows.net`,
        new azureIdentity.DefaultAzureCredential()
      );
    } else {
      throw new Error('Azure configuration requires either AZURE_CONNECTION_STRING, AZURE_ACCOUNT_NAME + AZURE_ACCOUNT_KEY, or AZURE_ACCOUNT_NAME (for Managed Identity)');
    }

    this._containerClient = this._blobServiceClient.getContainerClient(this.containerName);
    return this._containerClient;
  }

  override destroy(): void {
    this._blobServiceClient = undefined;
    this._containerClient = undefined;
  }

  /**
   * Uploads a file to Azure, or returns a SAS URL when in presigned mode.
   * 
   * For large files (>100MB), uses streaming upload to reduce
   * memory usage and improve reliability.
   */
  async upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult> {
    if (this.presignedMode) {
      return this.presignedUpload(file);
    }
    
    try {
      const { errors: validationErrors, resolvedSize } = await this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '), 'VALIDATION_FAILED');
      }

      const fileName = this.generateFileName(file.originalname);
      const blobPath = this.buildFilePath(fileName);
      const containerClient = await this.ensureContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
      
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

      options?.signal?.throwIfAborted();

      const abortSignal = options?.signal;

      if (this.shouldUseStreaming(resolvedSize)) {
        const fileStream = this.getFileStream(file);
        const streamOptions: {
          blobHTTPHeaders: typeof uploadOptions.blobHTTPHeaders;
          metadata?: Record<string, string>;
          abortSignal?: AbortSignal;
        } = {
          blobHTTPHeaders: uploadOptions.blobHTTPHeaders,
        };
        if (uploadOptions.metadata) {
          streamOptions.metadata = uploadOptions.metadata;
        }
        if (abortSignal) {
          streamOptions.abortSignal = abortSignal;
        }
        await blockBlobClient.uploadStream(
          fileStream,
          4 * 1024 * 1024,
          4,
          streamOptions
        );
      } else {
        const fileContent = await this.getFileContent(file);
        await blockBlobClient.uploadData(fileContent, {
          ...uploadOptions,
          ...(abortSignal ? { abortSignal } : {}),
        });
      }
      
      const fileUrl = `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${encodePathSegments(blobPath)}`;
      
      return this.createSuccessResult(blobPath, fileUrl);
    } catch (error) {
      await this.cleanupTempFile(file);
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
  async generateUploadUrl(fileName: string, contentType?: string, _fileSize?: number): Promise<PresignedUrlResult> {
    try {
      const decoded = this.decodeFileName(fileName);
      const url = await this.generateSasUrl(decoded, 'cw', contentType || 'application/octet-stream');
      return this.createPresignedSuccessResult(url);
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
    try {
      const decoded = this.decodeFileName(fileName);
      const url = await this.generateSasUrl(decoded, 'r');
      return this.createPresignedSuccessResult(undefined, url);
    } catch (error) {
      return this.createPresignedErrorResult(
        error instanceof Error ? error.message : 'Failed to generate view URL'
      );
    }
  }

  /**
   * Generates a SAS URL for a blob with the specified permissions.
   */
  private async generateSasUrl(blobName: string, permissions: string, contentType?: string): Promise<string> {
    if (!this.accountKey) {
      throw new Error('Account key is required for generating SAS URLs. Use connection string or provide AZURE_ACCOUNT_KEY.');
    }

    const azureBlob = await loadAzureBlobSDK();
    const containerClient = await this.ensureContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const expiresOn = new Date(Date.now() + (this.getPresignedUrlExpiry() * 1000));

    const sasOptions = {
      containerName: this.containerName,
      blobName,
      permissions: azureBlob.BlobSASPermissions.parse(permissions),
      expiresOn,
      ...(contentType ? { contentType } : {}),
    };

    const sasToken = azureBlob.generateBlobSASQueryParameters(
      sasOptions,
      new azureBlob.StorageSharedKeyCredential(this.accountName, this.accountKey)
    ).toString();

    return `${blockBlobClient.url}?${sasToken}`;
  }

  /**
   * Deletes a file from Azure Blob Storage.
   */
  async delete(fileName: string): Promise<DeleteResult> {
    try {
      const decodedFileName = this.decodeFileName(fileName);
      const containerClient = await this.ensureContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(decodedFileName);
      
      const exists = await blockBlobClient.exists();
      if (!exists) {
        return { success: false, reference: fileName, error: 'File not found', code: 'FILE_NOT_FOUND' };
      }
      
      await blockBlobClient.delete();
      return { success: true, reference: fileName };
    } catch (error) {
      return { success: false, reference: fileName, error: error instanceof Error ? error.message : 'Failed to delete file', code: 'PROVIDER_ERROR' };
    }
  }

  /**
   * Validates an upload against expected values and deletes invalid files.
   * Uses shared validation logic from BaseStorageDriver.
   * 
   * This is CRITICAL for Azure presigned uploads because Azure doesn't
   * enforce constraints at the URL level.
   */
  override async validateAndConfirmUpload(
    reference: string, 
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    try {
      const containerClient = await this.ensureContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(reference);
      const properties = await blockBlobClient.getProperties();

      const actual = {
        contentType: properties.contentType,
        fileSize: properties.contentLength,
      };

      const validationError = await this.checkUploadedFileMetadata(reference, actual, options);
      if (validationError) return validationError;

      const viewResult = await this.generateViewUrl(reference);
      return this.buildValidationSuccess(reference, viewResult.success ? viewResult.viewUrl : undefined, actual.contentType, actual.fileSize);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate upload',
        code: 'PROVIDER_ERROR',
      };
    }
  }

  /**
   * Returns metadata about a file from Azure without downloading it.
   */
  async getMetadata(reference: string): Promise<FileInfo | null> {
    try {
      const decoded = this.decodeFileName(reference);
      const containerClient = await this.ensureContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(decoded);
      const exists = await blockBlobClient.exists();
      if (!exists) return null;

      const properties = await blockBlobClient.getProperties();
      const info: FileInfo = { name: reference };
      if (properties.contentLength !== undefined) info.size = properties.contentLength;
      if (properties.contentType) info.contentType = properties.contentType;
      if (properties.lastModified) info.lastModified = properties.lastModified;
      return info;
    } catch {
      return null;
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
      const validatedMaxResults = this.validateMaxResults(maxResults);
      
      const containerClient = await this.ensureContainerClient();
      const files: FileInfo[] = [];
      let nextToken: string | undefined;

      const listOptions: { prefix?: string } = {};
      if (prefix) listOptions.prefix = prefix;

      const pageOptions: { maxPageSize: number; continuationToken?: string } = {
        maxPageSize: validatedMaxResults,
      };
      if (continuationToken) pageOptions.continuationToken = continuationToken;

      const iterator = containerClient.listBlobsFlat(listOptions)
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
        code: 'PROVIDER_ERROR',
      };
    }
  }
}
