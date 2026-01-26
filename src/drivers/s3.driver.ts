import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, BlobValidationOptions, BlobValidationResult, ListFilesResult, UploadOptions, FileInfo } from '../types/storage.types.js';
import type { Readable } from 'stream';

/**
 * S3StorageDriver - Handles file operations with Amazon S3.
 * 
 * Supports two authentication methods:
 * 1. Explicit credentials (AWS_ACCESS_KEY + AWS_SECRET_KEY)
 * 2. IAM roles (when running on AWS infrastructure)
 * 
 * If you don't provide credentials, the AWS SDK automatically uses
 * IAM roles, environment variables, or the shared credentials file.
 */
export class S3StorageDriver extends BaseStorageDriver {
  private s3Client: S3Client;
  private bucketName: string;
  private region: string;

  constructor(config: StorageConfig) {
    super(config);
    
    this.bucketName = config.bucketName!;
    this.region = config.awsRegion!;
    
    const s3Options: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
      region: this.region,
    };

    // Only set explicit credentials if provided — otherwise use IAM/default chain
    if (config.awsAccessKey && config.awsSecretKey) {
      s3Options.credentials = {
        accessKeyId: config.awsAccessKey,
        secretAccessKey: config.awsSecretKey,
      };
    }
    
    this.s3Client = new S3Client(s3Options);
  }

  /**
   * Uploads a file directly to S3.
   * Handles both memory and disk storage from Multer.
   * 
   * For large files (>100MB), uses streaming multipart upload to reduce
   * memory usage and improve reliability.
   */
  async upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult> {
    try {
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '));
      }

      const fileName = this.generateFileName(file.originalname);
      const fileKey = this.buildFilePath(fileName);
      const fileSize = this.getFileSize(file);
      
      // Use streaming upload for large files to reduce memory usage
      if (this.shouldUseStreaming(file)) {
        return this.uploadWithStream(file, fileKey, fileSize, options);
      }
      
      // Standard upload for smaller files
      const fileContent = this.getFileContent(file);
      
      const commandInput: {
        Bucket: string;
        Key: string;
        Body: Buffer;
        ContentType: string;
        ContentLength: number;
        CacheControl?: string;
        ContentDisposition?: string;
        Metadata?: Record<string, string>;
      } = {
        Bucket: this.bucketName,
        Key: fileKey,
        Body: fileContent,
        ContentType: options?.contentType || file.mimetype,
        ContentLength: fileContent.length,
      };

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
      await this.s3Client.send(uploadCommand);
      
      // Build the public URL with proper encoding
      const encodedKey = fileKey.split('/').map(segment => encodeURIComponent(segment)).join('/');
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${encodedKey}`;
      
      return this.createSuccessResult(fileKey, fileUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file to S3'
      );
    }
  }

  /**
   * Uploads a large file using streaming multipart upload.
   * 
   * This method uses the @aws-sdk/lib-storage Upload class which handles
   * multipart uploads automatically. It's more memory-efficient for large
   * files as it streams data in chunks rather than loading everything into memory.
   */
  private async uploadWithStream(
    file: Express.Multer.File,
    fileKey: string,
    fileSize: number,
    options?: UploadOptions
  ): Promise<FileUploadResult> {
    const fileStream: Readable = this.getFileStream(file);
    
    const uploadParams: {
      Bucket: string;
      Key: string;
      Body: Readable;
      ContentType: string;
      ContentLength?: number;
      CacheControl?: string;
      ContentDisposition?: string;
      Metadata?: Record<string, string>;
    } = {
      Bucket: this.bucketName,
      Key: fileKey,
      Body: fileStream,
      ContentType: options?.contentType || file.mimetype,
    };

    // Include content length if known (helps with progress tracking)
    if (fileSize > 0) {
      uploadParams.ContentLength = fileSize;
    }

    if (options?.cacheControl) {
      uploadParams.CacheControl = options.cacheControl;
    }
    if (options?.contentDisposition) {
      uploadParams.ContentDisposition = options.contentDisposition;
    }
    if (options?.metadata) {
      uploadParams.Metadata = options.metadata;
    }

    const upload = new Upload({
      client: this.s3Client,
      params: uploadParams,
      // Use 10MB parts for multipart upload (minimum is 5MB)
      partSize: 10 * 1024 * 1024,
      // Upload up to 4 parts concurrently
      queueSize: 4,
    });

    await upload.done();
    
    // Build the public URL with proper encoding
    const encodedKey = fileKey.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${encodedKey}`;
    
    return this.createSuccessResult(fileKey, fileUrl);
  }

  /**
   * Creates a presigned URL for uploading directly to S3.
   * 
   * The URL enforces:
   * - Exact content type (baked into the signature)
   * - Exact file size (if provided)
   * 
   * Clients that try to upload different content will get a 403.
   */
  async generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult> {
    // Security: Defense-in-depth validation (StorageManager also validates)
    // Decode URL-encoded characters first to catch encoded traversal attempts like %2e%2e%2f
    let decodedFileName: string;
    try {
      decodedFileName = decodeURIComponent(fileName);
    } catch {
      return this.createPresignedErrorResult('Invalid fileName: malformed URL encoding');
    }
    
    if (decodedFileName.includes('..') || decodedFileName.includes('\0')) {
      return this.createPresignedErrorResult('Invalid fileName: path traversal sequences are not allowed');
    }
    
    try {
      const resolvedContentType = contentType || 'application/octet-stream';
      
      const commandInput: {
        Bucket: string;
        Key: string;
        ContentType: string;
        ContentLength?: number;
      } = {
        Bucket: this.bucketName,
        Key: decodedFileName,
        ContentType: resolvedContentType,
      };

      if (fileSize !== undefined) {
        commandInput.ContentLength = fileSize;
      }

      const uploadCommand = new PutObjectCommand(commandInput);

      const uploadUrl = await getSignedUrl(this.s3Client, uploadCommand, {
        expiresIn: this.getPresignedUrlExpiry(),
        signableHeaders: new Set(['content-type', 'content-length']),
      });

      return this.createPresignedSuccessResult(uploadUrl);
    } catch (error) {
      return this.createPresignedErrorResult(
        error instanceof Error ? error.message : 'Failed to generate upload URL'
      );
    }
  }

  /**
   * Creates a presigned URL for downloading/viewing a file.
   */
  async generateViewUrl(fileName: string): Promise<PresignedUrlResult> {
    // Security: Defense-in-depth validation
    // Decode URL-encoded characters first to catch encoded traversal attempts like %2e%2e%2f
    let decodedFileName: string;
    try {
      decodedFileName = decodeURIComponent(fileName);
    } catch {
      return this.createPresignedErrorResult('Invalid fileName: malformed URL encoding');
    }
    
    if (decodedFileName.includes('..') || decodedFileName.includes('\0')) {
      return this.createPresignedErrorResult('Invalid fileName: path traversal sequences are not allowed');
    }
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: decodedFileName,
      });

      const viewUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: this.getPresignedUrlExpiry(),
      });

      return this.createPresignedSuccessResult(undefined, viewUrl);
    } catch (error) {
      return this.createPresignedErrorResult(
        error instanceof Error ? error.message : 'Failed to generate view URL'
      );
    }
  }

  /**
   * Deletes a file from S3.
   * Returns false if the file doesn't exist, throws on real errors.
   */
  async delete(fileName: string): Promise<boolean> {
    // Security: Defense-in-depth validation
    // Decode URL-encoded characters first to catch encoded traversal attempts like %2e%2e%2f
    let decodedFileName: string;
    try {
      decodedFileName = decodeURIComponent(fileName);
    } catch {
      return false;
    }
    
    if (decodedFileName.includes('..') || decodedFileName.includes('\0')) {
      return false;
    }
    
    const headCommand = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: decodedFileName,
    });
    
    try {
      await this.s3Client.send(headCommand);
    } catch (error) {
      const errorName = (error as { name?: string })?.name;
      const httpStatusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      
      if (httpStatusCode === 404 || errorName === 'NotFound' || errorName === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
    
    const deleteCommand = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: decodedFileName,
    });

    await this.s3Client.send(deleteCommand);
    return true;
  }

  /**
   * Confirms an upload and optionally validates the file.
   * 
   * For S3, validation is optional since constraints are enforced at URL level.
   * But you can still use this to verify the file matches expectations.
   */
  override async validateAndConfirmUpload(
    reference: string,
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    const deleteOnFailure = options?.deleteOnFailure !== false;
    
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: reference,
      });
      const headResult = await this.s3Client.send(headCommand);

      const actualContentType = headResult.ContentType;
      const actualFileSize = headResult.ContentLength;

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

      const result: BlobValidationResult = {
        success: true,
        reference,
        expiresIn: this.getPresignedUrlExpiry(),
      };
      
      if (viewResult.viewUrl) {
        result.viewUrl = viewResult.viewUrl;
      }
      if (actualContentType) {
        result.actualContentType = actualContentType;
      }
      if (actualFileSize !== undefined) {
        result.actualFileSize = actualFileSize;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'File not found or access denied';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Lists files in the bucket with optional prefix filtering and pagination.
   * 
   * Note: S3's list API doesn't return content types. Use validateAndConfirmUpload()
   * if you need content type information for specific files.
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
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix || undefined,
        MaxKeys: validatedMaxResults,
        ContinuationToken: continuationToken || undefined,
      });

      const response = await this.s3Client.send(command);

      const files: FileInfo[] = (response.Contents || []).map(item => {
        const fileInfo: FileInfo = { name: item.Key || '' };
        if (item.Size !== undefined) fileInfo.size = item.Size;
        if (item.LastModified) fileInfo.lastModified = item.LastModified;
        return fileInfo;
      });

      const result: ListFilesResult = {
        success: true,
        files,
      };

      if (response.NextContinuationToken) {
        result.nextToken = response.NextContinuationToken;
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
 * S3PresignedStorageDriver - S3 driver that returns presigned URLs from upload().
 * 
 * Use this when you want clients to upload directly to S3 without
 * the file passing through your server.
 */
export class S3PresignedStorageDriver extends S3StorageDriver {
  constructor(config: StorageConfig) {
    super(config);
  }

  /**
   * Instead of uploading the file, returns a presigned URL for the client to use.
   * 
   * The returned fileUrl is the presigned upload URL.
   * After the client uploads, use validateAndConfirmUpload() to get a view URL.
   * 
   * Note: The `options` parameter (metadata, cacheControl, etc.) is NOT applied
   * when using presigned uploads. These options must be set by the client when
   * making the actual upload request to S3, or configured via bucket policies.
   * For server-side uploads with full options support, use the regular 's3' driver.
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
