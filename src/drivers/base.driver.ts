import fs from 'fs';
import fsPromises from 'fs/promises';
import { Readable, Writable } from 'stream';
import { IStorageDriver, FileUploadResult, PresignedUrlResult, PresignedUrlSuccess, StorageConfig, BlobValidationOptions, BlobValidationResult, BlobValidationSuccess, BlobValidationError, ListFilesResult, UploadOptions, DeleteResult, StorageErrorCode, FileInfo, StorageFile } from '../types/storage.types.js';
import { generateUniqueFileName, hasPathTraversal, joinStoragePath } from '../utils/file.utils.js';
import {
  DEFAULT_PRESIGNED_URL_EXPIRY,
  MAX_PRESIGNED_URL_EXPIRY,
  MIN_PRESIGNED_URL_EXPIRY,
  STREAM_THRESHOLD,
} from '../constants.js';

export abstract class BaseStorageDriver implements IStorageDriver {
  protected readonly config: StorageConfig;
  protected readonly presignedMode: boolean;

  constructor(config: StorageConfig) {
    this.config = config;
    this.presignedMode = config.driver.endsWith('-presigned');
  }

  protected buildFilePath(fileName: string): string {
    return joinStoragePath(fileName, this.config.bucketPath);
  }

  abstract upload(file: StorageFile, options?: UploadOptions): Promise<FileUploadResult>;

  abstract generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;

  abstract generateViewUrl(fileName: string): Promise<PresignedUrlResult>;

  abstract delete(fileName: string): Promise<DeleteResult>;

  abstract listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;

  abstract getMetadata(reference: string): Promise<FileInfo | null>;

  
  destroy(): void {
    // No-op — subclasses override to close SDK clients
  }

  protected generateFileName(originalName: string): string {
    return generateUniqueFileName(originalName);
  }

  protected createSuccessResult(reference: string, fileUrl: string): FileUploadResult {
    return { success: true, reference, fileUrl };
  }

  protected createErrorResult(error: string, code: StorageErrorCode = 'PROVIDER_ERROR'): FileUploadResult {
    return { success: false, error, code };
  }

  protected createPresignedSuccessResult(uploadUrl?: string, viewUrl?: string): PresignedUrlSuccess {
    const result: PresignedUrlSuccess = { success: true };
    if (uploadUrl) result.uploadUrl = uploadUrl;
    if (viewUrl) result.viewUrl = viewUrl;
    return result;
  }

  protected createPresignedErrorResult(error: string, code: StorageErrorCode = 'PROVIDER_ERROR'): PresignedUrlResult {
    return { success: false, error, code };
  }

  protected async validateFile(file: StorageFile): Promise<{ errors: string[]; resolvedSize: number }> {
    const errors: string[] = [];

    if (!file) {
      errors.push('No file provided');
      return { errors, resolvedSize: 0 };
    }

    if (!file.originalname) {
      errors.push('File must have an original name');
    }

    if (!file.mimetype) {
      errors.push('File must have a MIME type');
    }

    const hasBuffer = (file.buffer?.length ?? 0) > 0;
    const hasPath = typeof file.path === 'string' && file.path.length > 0;
    const hasEmptyBuffer = file.buffer !== null && file.buffer !== undefined && file.buffer.length === 0;
    let resolvedSize = file.size || 0;
    
    if (hasEmptyBuffer && !hasPath) {
      errors.push('File is empty (0 bytes)');
    } else if (!hasBuffer && !hasPath) {
      errors.push('File must have either buffer (memory storage) or path (disk storage)');
    }

    if (hasPath && !hasBuffer) {
      try {
        const diskPath = file.path as string;
        const stats = await fsPromises.stat(diskPath);
        if (stats.size === 0) {
          errors.push('File is empty (0 bytes)');
        }
        resolvedSize = stats.size;
      } catch {
        errors.push('Cannot read file from disk storage path');
      }
    }

    if (hasBuffer && !resolvedSize) {
      resolvedSize = file.buffer?.length ?? 0;
    }

    if (this.config.maxFileSize && resolvedSize > this.config.maxFileSize) {
      errors.push(`File size ${resolvedSize} exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
    }

    return { errors, resolvedSize };
  }

  protected async getFileContent(file: StorageFile): Promise<Buffer> {
    if ((file.buffer?.length ?? 0) > 0) {
      return file.buffer as Buffer;
    }
    
    if (file.path) {
      return fsPromises.readFile(file.path);
    }
    
    throw new Error('File has neither buffer nor path - cannot read content');
  }

  protected getFileStream(file: StorageFile): Readable {
    if ((file.buffer?.length ?? 0) > 0) {
      return Readable.from(file.buffer as Buffer);
    }
    
    if (file.path) {
      return fs.createReadStream(file.path);
    }
    
    throw new Error('File has neither buffer nor path - cannot create stream');
  }

  protected shouldUseStreaming(fileSize: number): boolean {
    return fileSize > STREAM_THRESHOLD;
  }

  protected pipeWithAbort(
    readStream: Readable,
    writeStream: Writable,
    signal: AbortSignal | undefined,
    onErrorCleanup?: () => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanupAbort = (): void => {
        signal?.removeEventListener('abort', onAbort);
      };

      const fail = (err: unknown): void => {
        if (settled) return;
        settled = true;
        cleanupAbort();
        readStream.destroy();
        writeStream.destroy();
        onErrorCleanup?.();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const succeed = (): void => {
        if (settled) return;
        settled = true;
        cleanupAbort();
        resolve();
      };

      const onAbort = (): void => {
        const reason = signal?.reason;
        fail(reason instanceof Error ? reason : new Error('The operation was aborted'));
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }

      signal?.addEventListener('abort', onAbort, { once: true });
      readStream.on('error', fail);
      writeStream.on('error', fail);
      writeStream.on('finish', succeed);
      readStream.pipe(writeStream);
    });
  }

  protected async cleanupTempFile(file: StorageFile): Promise<void> {
    if (file.path) {
      try { await fsPromises.unlink(file.path); } catch { /* best-effort */ }
    }
  }

  protected getPresignedUrlExpiry(): number {
    const expiry = this.config.presignedUrlExpiry;
    
    if (expiry === undefined || Number.isNaN(expiry)) {
      return DEFAULT_PRESIGNED_URL_EXPIRY;
    }
    
    if (expiry < MIN_PRESIGNED_URL_EXPIRY) {
      return MIN_PRESIGNED_URL_EXPIRY;
    }
    if (expiry > MAX_PRESIGNED_URL_EXPIRY) {
      return MAX_PRESIGNED_URL_EXPIRY;
    }
    
    return expiry;
  }

  protected decodeFileName(fileName: string): string {
    let decoded: string;
    try {
      decoded = decodeURIComponent(fileName);
    } catch {
      throw new Error('Invalid fileName: malformed URL encoding');
    }
    if (hasPathTraversal(decoded)) {
      throw new Error('Invalid fileName: path traversal sequences are not allowed');
    }
    return decoded;
  }

  protected validateMaxResults(maxResults: number): number {
    return Math.floor(Math.max(1, Math.min(
      Number.isNaN(maxResults) ? 1000 : maxResults,
      1000
    )));
  }

  protected async presignedUpload(file: StorageFile): Promise<FileUploadResult> {
    try {
      const { errors, resolvedSize } = await this.validateFile(file);
      if (errors.length > 0) {
        return this.createErrorResult(errors.join(', '), 'VALIDATION_FAILED');
      }

      const fileName = this.generateFileName(file.originalname);
      const filePath = this.buildFilePath(fileName);

      const presignedResult = await this.generateUploadUrl(
        filePath,
        file.mimetype,
        resolvedSize
      );

      if (!presignedResult.success) {
        return this.createErrorResult(presignedResult.error, presignedResult.code);
      }

      return this.createSuccessResult(filePath, presignedResult.uploadUrl || '');
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to generate presigned URL'
      );
    }
  }

  protected async executeDirectUpload(
    file: StorageFile,
    options: UploadOptions | undefined,
    providerLabel: string,
    put: (ctx: {
      file: StorageFile;
      key: string;
      resolvedSize: number;
      options?: UploadOptions | undefined;
    }) => Promise<string>
  ): Promise<FileUploadResult> {
    try {
      const { errors, resolvedSize } = await this.validateFile(file);
      if (errors.length > 0) {
        return this.createErrorResult(errors.join(', '), 'VALIDATION_FAILED');
      }

      const fileName = this.generateFileName(file.originalname);
      const key = this.buildFilePath(fileName);
      const fileUrl = await put({ file, key, resolvedSize, options });
      return this.createSuccessResult(key, fileUrl);
    } catch (error) {
      await this.cleanupTempFile(file);
      return this.createErrorResult(
        error instanceof Error ? error.message : `Failed to upload file to ${providerLabel}`
      );
    }
  }

  protected async confirmUploadFromMetadata(
    reference: string,
    options: BlobValidationOptions | undefined,
    fetchActual: () => Promise<{ contentType?: string | undefined; fileSize?: number | undefined }>,
    notFoundFallback = 'File not found or access denied'
  ): Promise<BlobValidationResult> {
    try {
      const actual = await fetchActual();
      const validationError = await this.checkUploadedFileMetadata(reference, actual, options);
      if (validationError) return validationError;

      const viewResult = await this.generateViewUrl(reference);
      return this.buildValidationSuccess(
        reference,
        viewResult.success ? viewResult.viewUrl : undefined,
        actual.contentType,
        actual.fileSize
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : notFoundFallback,
        code: 'FILE_NOT_FOUND',
      };
    }
  }

  async validateAndConfirmUpload(reference: string, _options?: BlobValidationOptions): Promise<BlobValidationResult> {
    const viewResult = await this.generateViewUrl(reference);
    
    if (viewResult.success) {
      const result: BlobValidationSuccess = {
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
      error: viewResult.error,
      code: 'FILE_NOT_FOUND',
    };
  }

  protected async checkUploadedFileMetadata(
    reference: string,
    actual: { contentType?: string | undefined; fileSize?: number | undefined },
    options?: BlobValidationOptions
  ): Promise<BlobValidationError | null> {
    const deleteOnFailure = options?.deleteOnFailure !== false;

    if (options?.expectedContentType && actual.contentType !== options.expectedContentType) {
      if (deleteOnFailure) await this.delete(reference);
      return this.buildValidationError(
        `Content type mismatch: expected '${options.expectedContentType}', got '${actual.contentType}'`,
        deleteOnFailure, actual.contentType, actual.fileSize
      );
    }

    if (options?.expectedFileSize !== undefined && actual.fileSize !== options.expectedFileSize) {
      if (deleteOnFailure) await this.delete(reference);
      return this.buildValidationError(
        `File size mismatch: expected ${options.expectedFileSize} bytes, got ${actual.fileSize} bytes`,
        deleteOnFailure, actual.contentType, actual.fileSize
      );
    }

    return null;
  }

  protected buildValidationSuccess(
    reference: string,
    viewUrl?: string,
    actualContentType?: string,
    actualFileSize?: number
  ): BlobValidationSuccess {
    const result: BlobValidationSuccess = {
      success: true,
      reference,
      expiresIn: this.getPresignedUrlExpiry(),
    };
    if (viewUrl) result.viewUrl = viewUrl;
    if (actualContentType) result.actualContentType = actualContentType;
    if (actualFileSize !== undefined) result.actualFileSize = actualFileSize;
    return result;
  }

  private buildValidationError(
    message: string,
    deleted: boolean,
    contentType?: string,
    fileSize?: number
  ): BlobValidationError {
    const result: BlobValidationError = {
      success: false,
      error: `${message}${deleted ? ' (file deleted)' : ' (file kept for inspection)'}`,
      code: 'VALIDATION_FAILED',
    };
    if (contentType) result.actualContentType = contentType;
    if (fileSize !== undefined) result.actualFileSize = fileSize;
    return result;
  }
}
