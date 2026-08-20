import type {
  BlobServiceClient as BlobServiceClientType,
  ContainerClient as ContainerClientType,
} from '@azure/storage-blob';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo, DeleteResult, StorageFile } from '../types/storage.types.js';
import { encodePathSegments } from '../utils/file.utils.js';
import { isNotFoundError } from '../utils/errors.js';
import { createLazyImport } from '../utils/lazy-import.js';

const loadAzureBlobSDK = createLazyImport(
  () => import('@azure/storage-blob'),
  '@azure/storage-blob is required for Azure storage.\nInstall: npm install @azure/storage-blob @azure/identity'
);

const loadAzureIdentity = createLazyImport(
  () => import('@azure/identity'),
  '@azure/identity is required for Azure Managed Identity authentication.\nInstall: npm install @azure/identity'
);

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

  async upload(file: StorageFile, options?: UploadOptions): Promise<FileUploadResult> {
    if (this.presignedMode) {
      return this.presignedUpload(file);
    }

    return this.executeDirectUpload(file, options, 'Azure', async ({ file: uploadFile, key, resolvedSize, options: uploadOptions }) => {
      const containerClient = await this.ensureContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(key);

      const blobOptions: {
        blobHTTPHeaders: {
          blobContentType: string;
          blobCacheControl?: string;
          blobContentDisposition?: string;
        };
        metadata?: Record<string, string>;
      } = {
        blobHTTPHeaders: {
          blobContentType: uploadOptions?.contentType || uploadFile.mimetype,
        },
      };

      if (uploadOptions?.cacheControl) {
        blobOptions.blobHTTPHeaders.blobCacheControl = uploadOptions.cacheControl;
      }
      if (uploadOptions?.contentDisposition) {
        blobOptions.blobHTTPHeaders.blobContentDisposition = uploadOptions.contentDisposition;
      }
      if (uploadOptions?.metadata) {
        blobOptions.metadata = uploadOptions.metadata;
      }

      uploadOptions?.signal?.throwIfAborted();
      const abortSignal = uploadOptions?.signal;

      if (this.shouldUseStreaming(resolvedSize)) {
        const fileStream = this.getFileStream(uploadFile);
        const streamOptions: {
          blobHTTPHeaders: typeof blobOptions.blobHTTPHeaders;
          metadata?: Record<string, string>;
          abortSignal?: AbortSignal;
        } = {
          blobHTTPHeaders: blobOptions.blobHTTPHeaders,
        };
        if (blobOptions.metadata) {
          streamOptions.metadata = blobOptions.metadata;
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
        const fileContent = await this.getFileContent(uploadFile);
        await blockBlobClient.uploadData(fileContent, {
          ...blobOptions,
          ...(abortSignal ? { abortSignal } : {}),
        });
      }

      return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${encodePathSegments(key)}`;
    });
  }

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

  async delete(fileName: string): Promise<DeleteResult> {
    try {
      const decodedFileName = this.decodeFileName(fileName);
      const containerClient = await this.ensureContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(decodedFileName);
      await blockBlobClient.delete();
      return { success: true, reference: fileName };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { success: false, reference: fileName, error: 'File not found', code: 'FILE_NOT_FOUND' };
      }
      return { success: false, reference: fileName, error: error instanceof Error ? error.message : 'Failed to delete file', code: 'PROVIDER_ERROR' };
    }
  }

  
  override async validateAndConfirmUpload(
    reference: string, 
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    return this.confirmUploadFromMetadata(
      reference,
      options,
      async () => {
        const containerClient = await this.ensureContainerClient();
        const blockBlobClient = containerClient.getBlockBlobClient(reference);
        const properties = await blockBlobClient.getProperties();
        return {
          contentType: properties.contentType,
          fileSize: properties.contentLength,
        };
      },
      'Failed to validate upload'
    );
  }

  async getMetadata(reference: string): Promise<FileInfo | null> {
    try {
      const decoded = this.decodeFileName(reference);
      const containerClient = await this.ensureContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(decoded);
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
