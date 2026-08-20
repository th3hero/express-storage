import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, ListFilesResult, UploadOptions, FileInfo, BlobValidationOptions, BlobValidationResult, BlobValidationSuccess, DeleteResult, StorageFile } from '../types/storage.types.js';
import { createMonthBasedPath, detectMimeType, ensureDirectoryExists, hasPathTraversal } from '../utils/file.utils.js';
import { DEFAULT_LOCAL_PATH, LOCAL_META_SUFFIX } from '../constants.js';

async function detectMimeTypeFromMagicBytes(filePath: string): Promise<string | undefined> {
  try {
    const fd = await fsPromises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(16);
      const { bytesRead } = await fd.read(buffer, 0, 16, 0);
      if (bytesRead === 0) return undefined;
      return detectMimeType(buffer.subarray(0, bytesRead));
    } finally {
      await fd.close();
    }
  } catch {
    return undefined;
  }
}

async function detectContentType(filePath: string, reference: string): Promise<string | undefined> {
  const magicMime = await detectMimeTypeFromMagicBytes(filePath);
  if (magicMime) return magicMime;
  const ext = path.extname(reference).toLowerCase();
  return ext && EXTENSION_MIME_MAP[ext] ? EXTENSION_MIME_MAP[ext] : undefined;
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const MAX_RECURSION_DEPTH = 100;
const MAX_ENTRIES_SCANNED = 50_000;

function couldContainPrefix(dirRelativePath: string, targetPrefix: string): boolean {
  if (!targetPrefix) return true;
  return targetPrefix.startsWith(dirRelativePath) ||
         dirRelativePath.startsWith(targetPrefix) ||
         dirRelativePath === '';
}

function isAfterToken(filePath: string, token: string | undefined): boolean {
  if (!token) return true;
  return filePath.localeCompare(token) > 0;
}

async function buildFileInfo(absolutePath: string, relativePath: string): Promise<FileInfo | null> {
  try {
    const stat = await fsPromises.stat(absolutePath);
    const ext = path.extname(relativePath).toLowerCase();
    return {
      name: relativePath,
      size: stat.size,
      lastModified: stat.mtime,
      contentType: (ext && EXTENSION_MIME_MAP[ext]) ? EXTENSION_MIME_MAP[ext] : 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

interface WalkOptions {
  prefix?: string | undefined;
  continuationToken?: string | undefined;
  maxCollect: number;
}

interface WalkResult {
  files: FileInfo[];
  hasMore: boolean;
}

async function walkDirectory(baseDir: string, options: WalkOptions): Promise<WalkResult> {
  const files: FileInfo[] = [];
  let hasMore = false;
  let entriesScanned = 0;

  const walk = async (dir: string, dirRelativePath: string, depth: number): Promise<boolean> => {
    if (depth > MAX_RECURSION_DEPTH || files.length >= options.maxCollect || entriesScanned >= MAX_ENTRIES_SCANNED) {
      if (files.length >= options.maxCollect || entriesScanned >= MAX_ENTRIES_SCANNED) hasMore = true;
      return files.length < options.maxCollect && entriesScanned < MAX_ENTRIES_SCANNED;
    }

    if (options.prefix && !couldContainPrefix(dirRelativePath, options.prefix)) {
      return true;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return true;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      entriesScanned++;
      if (files.length >= options.maxCollect || entriesScanned >= MAX_ENTRIES_SCANNED) {
        hasMore = true;
        return false;
      }

      if (entry.isSymbolicLink()) continue;
      if (entry.name.endsWith(LOCAL_META_SUFFIX)) continue;

      const itemPath = path.join(dir, entry.name);
      const relativePath = dirRelativePath ? `${dirRelativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (options.continuationToken && !couldContainPrefix(relativePath, options.continuationToken.split('/')[0] || '')) {
          if (relativePath.localeCompare(options.continuationToken) < 0 && !options.continuationToken.startsWith(relativePath + '/')) {
            continue;
          }
        }
        if (!await walk(itemPath, relativePath, depth + 1)) return false;
      } else if (entry.isFile()) {
        if (options.prefix && !relativePath.startsWith(options.prefix)) continue;
        if (!isAfterToken(relativePath, options.continuationToken)) continue;

        const info = await buildFileInfo(itemPath, relativePath);
        if (info) files.push(info);
      }
    }
    return true;
  };

  await walk(baseDir, '', 0);
  return { files, hasMore };
}

function paginateFiles(files: FileInfo[], maxResults: number, hasMore: boolean): ListFilesResult {
  files.sort((a, b) => a.name.localeCompare(b.name));
  const page = files.slice(0, maxResults);

  const result: ListFilesResult = { success: true, files: page };

  if (files.length > maxResults || hasMore) {
    const lastFile = page[page.length - 1];
    if (lastFile) result.nextToken = lastFile.name;
  }

  return result;
}

export class LocalStorageDriver extends BaseStorageDriver {
  private readonly basePath: string;
  private readonly originalLocalPath: string;

  constructor(config: StorageConfig) {
    super(config);
    this.originalLocalPath = config.localPath || DEFAULT_LOCAL_PATH;
    this.basePath = path.resolve(this.originalLocalPath);
  }

  async upload(file: StorageFile, options?: UploadOptions): Promise<FileUploadResult> {
    try {
      const { errors: validationErrors, resolvedSize } = await this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '), 'VALIDATION_FAILED');
      }

      const fileName = this.generateFileName(file.originalname);
      const monthPath = createMonthBasedPath(this.basePath);
      const fullDirPath = path.resolve(monthPath);
      
      await ensureDirectoryExists(fullDirPath);
      
      const filePath = path.join(fullDirPath, fileName);

      options?.signal?.throwIfAborted();
      
      if (this.shouldUseStreaming(resolvedSize)) {
        await this.uploadWithStream(file, filePath, options?.signal);
      } else {
        const fileContent = await this.getFileContent(file);
        await fsPromises.writeFile(filePath, fileContent, options?.signal ? { signal: options.signal } : undefined);
      }

      await this.writeSidecar(filePath, options);
      
      const fileUrl = this.generateFileUrl(filePath);
      
      const relativePath = this.normalizePathSeparators(
        path.relative(this.basePath, path.resolve(filePath))
      );
      
      return this.createSuccessResult(relativePath, fileUrl);
    } catch (error) {
      await this.cleanupTempFile(file);
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file'
      );
    }
  }

  private async writeSidecar(filePath: string, options?: UploadOptions): Promise<void> {
    const hasMetadata = options?.metadata && Object.keys(options.metadata).length > 0;
    if (!hasMetadata && !options?.contentType && !options?.cacheControl && !options?.contentDisposition) {
      return;
    }

    const meta: Record<string, unknown> = {};
    if (hasMetadata) meta['metadata'] = options.metadata;
    if (options?.contentType) meta['contentType'] = options.contentType;
    if (options?.cacheControl) meta['cacheControl'] = options.cacheControl;
    if (options?.contentDisposition) meta['contentDisposition'] = options.contentDisposition;
    await fsPromises.writeFile(filePath + LOCAL_META_SUFFIX, JSON.stringify(meta));
  }

  private async readSidecar(filePath: string): Promise<{
    metadata?: Record<string, string>;
    contentType?: string;
  }> {
    try {
      const raw: unknown = JSON.parse(await fsPromises.readFile(filePath + LOCAL_META_SUFFIX, 'utf8'));
      if (!raw || typeof raw !== 'object') return {};
      const record = raw as Record<string, unknown>;
      const result: { metadata?: Record<string, string>; contentType?: string } = {};
      if (record['metadata'] && typeof record['metadata'] === 'object' && !Array.isArray(record['metadata'])) {
        const metadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(record['metadata'] as Record<string, unknown>)) {
          if (typeof value === 'string') metadata[key] = value;
        }
        result.metadata = metadata;
      }
      if (typeof record['contentType'] === 'string') {
        result.contentType = record['contentType'];
      }
      return result;
    } catch {
      return {};
    }
  }

  private async deleteSidecar(filePath: string): Promise<void> {
    try {
      await fsPromises.unlink(filePath + LOCAL_META_SUFFIX);
    } catch {
      /* best-effort */
    }
  }

  private async uploadWithStream(file: StorageFile, filePath: string, signal?: AbortSignal): Promise<void> {
    const readStream = this.getFileStream(file);
    const writeStream = fs.createWriteStream(filePath);
    await this.pipeWithAbort(readStream, writeStream, signal, () => {
      void fsPromises.unlink(filePath).catch(() => {});
    });
  }

  private generateFileUrl(filePath: string): string {
    const absoluteFilePath = path.resolve(filePath);
    const relativeFromBase = this.normalizePathSeparators(
      path.relative(this.basePath, absoluteFilePath)
    );
    
    const normalizedLocalPath = this.normalizePathSeparators(this.originalLocalPath);
    
    if (normalizedLocalPath.startsWith('public/')) {
      const webBasePath = normalizedLocalPath.replace(/^public\//, '');
      return this.normalizeUrl(`/${webBasePath}/${relativeFromBase}`);
    }
    
    return this.normalizeUrl(`/${normalizedLocalPath}/${relativeFromBase}`);
  }

  private normalizePathSeparators(pathStr: string): string {
    return pathStr.replace(/\\/g, '/');
  }

  private normalizeUrl(url: string): string {
    return url.replace(/\/+/g, '/');
  }

  
  // eslint-disable-next-line @typescript-eslint/require-await
  async generateUploadUrl(_fileName: string, _contentType?: string, _maxSize?: number): Promise<PresignedUrlResult> {
    return this.createPresignedErrorResult(
      'Presigned URLs are not supported for local storage',
      'PRESIGNED_NOT_SUPPORTED'
    );
  }

  
  // eslint-disable-next-line @typescript-eslint/require-await
  async generateViewUrl(_fileName: string): Promise<PresignedUrlResult> {
    return this.createPresignedErrorResult(
      'Presigned URLs are not supported for local storage',
      'PRESIGNED_NOT_SUPPORTED'
    );
  }

  
  override async validateAndConfirmUpload(
    reference: string,
    options?: BlobValidationOptions
  ): Promise<BlobValidationResult> {
    try {
      const filePath = await this.resolveFilePath(reference);
      
      if (!filePath) {
        return { success: false, error: 'File not found', code: 'FILE_NOT_FOUND' };
      }
      
      const stats = await fsPromises.stat(filePath);
      const actual = {
        contentType: await detectContentType(filePath, reference),
        fileSize: stats.size,
      };

      const validationError = await this.checkUploadedFileMetadata(reference, actual, options);
      if (validationError) return validationError;

      const result: BlobValidationSuccess = {
        success: true,
        reference,
        viewUrl: this.generateFileUrl(filePath),
        actualFileSize: actual.fileSize,
      };
      if (actual.contentType) result.actualContentType = actual.contentType;
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate upload',
        code: 'PROVIDER_ERROR',
      };
    }
  }

  async delete(reference: string): Promise<DeleteResult> {
    try {
      const decoded = this.decodeFileName(reference);
      const baseDir = this.basePath;
      const resolvedPath = path.resolve(path.join(baseDir, decoded));
      
      if (!resolvedPath.startsWith(baseDir + path.sep) && resolvedPath !== baseDir) {
        return { success: false, reference, error: 'Invalid reference: path is outside storage directory', code: 'PATH_TRAVERSAL' };
      }
      
      let stat: fs.Stats;
      try {
        stat = await fsPromises.lstat(resolvedPath);
      } catch {
        return { success: false, reference, error: 'File not found', code: 'FILE_NOT_FOUND' };
      }
      
      if (stat.isSymbolicLink()) {
        return { success: false, reference, error: 'Symbolic links cannot be deleted', code: 'VALIDATION_FAILED' };
      }
      
      if (!stat.isFile()) {
        return { success: false, reference, error: 'Path is not a regular file', code: 'VALIDATION_FAILED' };
      }
      
      await fsPromises.unlink(resolvedPath);
      await this.deleteSidecar(resolvedPath);
      return { success: true, reference };
    } catch (error) {
      return { success: false, reference, error: error instanceof Error ? error.message : 'Failed to delete file', code: 'PROVIDER_ERROR' };
    }
  }

  private async resolveFilePath(reference: string): Promise<string | null> {
    const baseDir = this.basePath;
    
    let decoded: string;
    try {
      decoded = this.decodeFileName(reference);
    } catch {
      return null;
    }
    
    const directPath = path.join(baseDir, decoded);
    const resolvedPath = path.resolve(directPath);
    
    if (!resolvedPath.startsWith(baseDir + path.sep) && resolvedPath !== baseDir) {
      return null;
    }
    
    try {
      const stat = await fsPromises.lstat(directPath);
      if (stat.isSymbolicLink() || !stat.isFile()) return null;
      return directPath;
    } catch {
      return null;
    }
  }

  async getMetadata(reference: string): Promise<FileInfo | null> {
    const filePath = await this.resolveFilePath(reference);
    if (!filePath) return null;

    try {
      const stats = await fsPromises.stat(filePath);
      const contentType = await detectContentType(filePath, reference);
      const sidecar = await this.readSidecar(filePath);

      const info: FileInfo = {
        name: reference,
        size: stats.size,
        lastModified: stats.mtime,
      };
      const resolvedType = sidecar.contentType ?? contentType;
      if (resolvedType) {
        info.contentType = resolvedType;
      }
      if (sidecar.metadata) {
        info.metadata = sidecar.metadata;
      }
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
      let decodedPrefix: string | undefined;
      if (prefix) {
        try {
          decodedPrefix = decodeURIComponent(prefix);
        } catch {
          return { success: false, error: 'Invalid prefix: malformed URL encoding', code: 'INVALID_INPUT' };
        }
      }
      
      if (decodedPrefix && hasPathTraversal(decodedPrefix)) {
        return { success: false, error: 'Invalid prefix: path traversal sequences are not allowed', code: 'PATH_TRAVERSAL' };
      }
      
      const validatedMaxResults = this.validateMaxResults(maxResults);
      const baseDir = this.basePath;
      
      try {
        await fsPromises.access(baseDir);
      } catch {
        return { success: true, files: [] };
      }

      const { files, hasMore } = await walkDirectory(baseDir, {
        prefix: decodedPrefix,
        continuationToken,
        maxCollect: validatedMaxResults + 1,
      });

      return paginateFiles(files, validatedMaxResults, hasMore);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
        code: 'PROVIDER_ERROR',
      };
    }
  }
}
