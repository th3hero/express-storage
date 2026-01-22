import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig } from '../types/storage.types.js';

/**
 * Azure Blob Storage driver
 * 
 * Supports two authentication methods:
 * 1. Connection string (recommended for simplicity)
 * 2. Account name + Account key (for more control)
 * 
 * Also supports Azure Managed Identity when deployed on Azure (no credentials needed)
 */
export class AzureStorageDriver extends BaseStorageDriver {
  private blobServiceClient: BlobServiceClient;
  private containerClient: ContainerClient;
  private containerName: string;
  private accountName: string;
  private accountKey?: string;

  constructor(config: StorageConfig) {
    super(config);
    
    this.containerName = config.azureContainerName || config.bucketName!;
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
    } else if (config.azureAccountName && config.azureAccountKey) {
      // Option 2: Account name + key
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
    } else {
      // Option 3: Default Azure credentials (Managed Identity)
      // This works when deployed on Azure (App Service, Functions, VMs with managed identity)
      this.accountName = config.azureAccountName || '';
      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`
      );
    }
    
    this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
  }

  /**
   * Upload file to Azure Blob Storage
   */
  async upload(file: Express.Multer.File): Promise<FileUploadResult> {
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
      
      // Upload file
      await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype,
        },
      });
      
      // Generate file URL
      const fileUrl = blockBlobClient.url;
      
      return this.createSuccessResult(fileName, fileUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file to Azure'
      );
    }
  }

  /**
   * Generate presigned upload URL (SAS URL)
   * @param fileName - Name of the file
   * @param contentType - Optional MIME type (Azure SAS doesn't enforce content type)
   * @param _maxSize - Optional max file size (Azure SAS doesn't support size limits)
   */
  async generateUploadUrl(fileName: string, contentType?: string, _maxSize?: number): Promise<PresignedUrlResult> {
    try {
      if (!this.accountKey) {
        return this.createPresignedErrorResult(
          'Account key is required for generating SAS URLs. Use connection string or provide AZURE_ACCOUNT_KEY.'
        );
      }

      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const expiresOn = new Date(Date.now() + (this.getPresignedUrlExpiry() * 1000));
      
      // Build SAS options
      const sasOptions: {
        containerName: string;
        blobName: string;
        permissions: BlobSASPermissions;
        expiresOn: Date;
        contentType?: string;
      } = {
        containerName: this.containerName,
        blobName: fileName,
        permissions: BlobSASPermissions.parse('cw'), // create and write
        expiresOn,
      };
      
      // Only add contentType if provided
      if (contentType) {
        sasOptions.contentType = contentType;
      }
      
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
   * Generate presigned view URL (SAS URL)
   */
  async generateViewUrl(fileName: string): Promise<PresignedUrlResult> {
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
          permissions: BlobSASPermissions.parse('r'), // read only
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
   * Delete file from Azure Blob Storage
   */
  async delete(fileName: string): Promise<boolean> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      await blockBlobClient.delete();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Azure Blob Storage presigned driver
 */
export class AzurePresignedStorageDriver extends AzureStorageDriver {
  constructor(config: StorageConfig) {
    super(config);
  }

  /**
   * Override upload to return presigned URL instead of direct upload
   */
  override async upload(file: Express.Multer.File): Promise<FileUploadResult> {
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
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to generate presigned URL'
      );
    }
  }
}
