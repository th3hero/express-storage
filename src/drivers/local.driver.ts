import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, ListFilesResult, UploadOptions, FileInfo, BlobValidationOptions, BlobValidationResult, BlobValidationSuccess, DeleteResult } from '../types/storage.types.js';
import { createMonthBasedPath, ensureDirectoryExists } from '../utils/file.utils.js';

/**
 * Magic byte signatures for common file types.
 * Used to detect actual file content type regardless of extension.
 * This provides security against extension spoofing attacks.
 */
const MAGIC_BYTES: Array<{ bytes: number[]; mimeType: string; offset?: number }> = [
  // Images
  { bytes: [0xFF, 0xD8, 0xFF], mimeType: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mimeType: 'image/png' },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mimeType: 'image/gif' },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mimeType: 'image/gif' },
  { bytes: [0x42, 0x4D], mimeType: 'image/bmp' },
  // Documents
  { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: 'application/pdf' },
  { bytes: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/zip' },
  { bytes: [0x50, 0x4B, 0x05, 0x06], mimeType: 'application/zip' },
  { bytes: [0x50, 0x4B, 0x07, 0x08], mimeType: 'application/zip' },
  // Archives
  { bytes: [0x1F, 0x8B], mimeType: 'application/gzip' },
  { bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], mimeType: 'application/vnd.rar' },
  { bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], mimeType: 'application/x-7z-compressed' },
  // Audio/Video
  { bytes: [0x49, 0x44, 0x33], mimeType: 'audio/mpeg' },
  { bytes: [0xFF, 0xFB], mimeType: 'audio/mpeg' },
  { bytes: [0xFF, 0xFA], mimeType: 'audio/mpeg' },
  { bytes: [0x4F, 0x67, 0x67, 0x53], mimeType: 'audio/ogg' },
  { bytes: [0x66, 0x74, 0x79, 0x70], mimeType: 'video/mp4', offset: 4 },
  // Executables (for security detection)
  { bytes: [0x4D, 0x5A], mimeType: 'application/x-msdownload' },
  { bytes: [0x7F, 0x45, 0x4C, 0x46], mimeType: 'application/x-executable' },
];

/**
 * Detects MIME type from file content using magic bytes.
 * Returns undefined if no match is found (falls back to extension-based detection).
 */
async function detectMimeTypeFromMagicBytes(filePath: string): Promise<string | undefined> {
  try {
    const fd = await fsPromises.open(filePath, 'r');
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await fd.read(buffer, 0, 16, 0);
    await fd.close();
    
    if (bytesRead === 0) {
      return undefined;
    }
    
    for (const signature of MAGIC_BYTES) {
      const offset = signature.offset || 0;
      if (offset + signature.bytes.length > bytesRead) {
        continue;
      }
      
      let matches = true;
      for (let i = 0; i < signature.bytes.length; i++) {
        if (buffer[offset + i] !== signature.bytes[i]) {
          matches = false;
          break;
        }
      }
      
      if (matches) {
        return signature.mimeType;
      }
    }
    
    // RIFF container: bytes 0-3 = 'RIFF', bytes 8-11 = sub-format identifier
    if (bytesRead >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 &&
        buffer[2] === 0x46 && buffer[3] === 0x46) {
      const subFormat = buffer.subarray(8, 12).toString('ascii');
      switch (subFormat) {
        case 'WEBP': return 'image/webp';
        case 'WAVE': return 'audio/wav';
        case 'AVI ': return 'video/x-msvideo';
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Detects content type using magic bytes first, then extension as fallback.
 */
async function detectContentType(filePath: string, reference: string): Promise<string | undefined> {
  const magicMime = await detectMimeTypeFromMagicBytes(filePath);
  if (magicMime) return magicMime;
  const ext = path.extname(reference).toLowerCase();
  return ext && EXTENSION_MIME_MAP[ext] ? EXTENSION_MIME_MAP[ext] : undefined;
}

/**
 * Maps file extensions to MIME types.
 * Used as fallback when magic byte detection doesn't match.
 */
const EXTENSION_MIME_MAP: Record<string, string> = {
  // Images
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
  // Documents
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
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  // Archives
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  // Web
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  // Fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

// ---------------------------------------------------------------------------
// listFiles helpers — extracted for testability and clarity
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// LocalStorageDriver
// ---------------------------------------------------------------------------

/**
 * LocalStorageDriver - Saves files to your local filesystem.
 * 
 * Great for development and small-scale applications.
 * Files are organized by year/month folders automatically.
 * 
 * **Security features:**
 * - Path traversal prevention (blocks ../ and null bytes)
 * - Symlinks are NOT followed or deleted (prevents directory escape attacks)
 * - Magic byte detection for content-type validation (prevents extension spoofing)
 * - Files stay within the configured base directory
 * 
 * Note: Local storage doesn't support presigned URLs since
 * there's no external service to sign requests against.
 */
export class LocalStorageDriver extends BaseStorageDriver {
  private readonly basePath: string;
  private readonly originalLocalPath: string;

  constructor(config: StorageConfig) {
    super(config);
    this.originalLocalPath = config.localPath || 'public/express-storage';
    this.basePath = path.resolve(this.originalLocalPath);
  }

  /**
   * Saves a file to the local filesystem.
   * 
   * Files are automatically organized into YYYY/MM folders.
   * For large files (>100MB), uses streaming to reduce memory usage.
   */
  async upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult> {
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
        await this.uploadWithStream(file, filePath);
      } else {
        const fileContent = await this.getFileContent(file);
        await fsPromises.writeFile(filePath, fileContent);
      }

      if (options?.metadata && Object.keys(options.metadata).length > 0) {
        const meta: Record<string, unknown> = { metadata: options.metadata };
        if (options.contentType) meta['contentType'] = options.contentType;
        if (options.cacheControl) meta['cacheControl'] = options.cacheControl;
        if (options.contentDisposition) meta['contentDisposition'] = options.contentDisposition;
        const metaPath = filePath + '.meta.json';
        await fsPromises.writeFile(metaPath, JSON.stringify(meta));
      }
      
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

  /**
   * Uploads a large file using streaming.
   * Pipes the file stream directly to disk for memory efficiency.
   */
  private async uploadWithStream(file: Express.Multer.File, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = this.getFileStream(file);
      const writeStream = fs.createWriteStream(filePath);

      readStream
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', (err) => {
          void fsPromises.unlink(filePath).catch(() => {});
          reject(err);
        });

      readStream.on('error', (err) => {
        writeStream.destroy();
        void fsPromises.unlink(filePath).catch(() => {});
        reject(err);
      });
    });
  }

  /**
   * Builds a URL for accessing the file.
   * 
   * If basePath starts with 'public/', strips that prefix since
   * Express.static('public') serves files from /
   */
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

  /**
   * Local storage doesn't support presigned upload URLs.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async generateUploadUrl(_fileName: string, _contentType?: string, _maxSize?: number): Promise<PresignedUrlResult> {
    return this.createPresignedErrorResult(
      'Presigned URLs are not supported for local storage',
      'PRESIGNED_NOT_SUPPORTED'
    );
  }

  /**
   * Local storage doesn't support presigned view URLs.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async generateViewUrl(_fileName: string): Promise<PresignedUrlResult> {
    return this.createPresignedErrorResult(
      'Presigned URLs are not supported for local storage',
      'PRESIGNED_NOT_SUPPORTED'
    );
  }

  /**
   * Validates a local file exists and matches expected values.
   * 
   * Content type detection uses a two-tier approach:
   * 1. Magic byte detection (examines actual file content for security)
   * 2. Extension-based fallback (when magic bytes don't match)
   */
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

  /**
   * Deletes a file from local storage.
   * 
   * Security: decodeFileName() rejects traversal/encoding attacks.
   * Containment check ensures resolved path stays within basePath.
   * Symlinks and non-files are rejected.
   */
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
      return { success: true, reference };
    } catch (error) {
      return { success: false, reference, error: error instanceof Error ? error.message : 'Failed to delete file', code: 'PROVIDER_ERROR' };
    }
  }

  /**
   * Resolves a decoded reference to a verified file path within basePath.
   * Checks containment (path stays inside basePath), rejects symlinks,
   * and verifies the target is a regular file.
   * 
   * Callers are responsible for decoding/validating the reference first
   * (via decodeFileName or StorageManager's hasPathTraversal check).
   */
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

  /**
   * Returns metadata about a file without downloading it.
   * Uses magic byte detection for accurate content type identification.
   */
  async getMetadata(reference: string): Promise<FileInfo | null> {
    const filePath = await this.resolveFilePath(reference);
    if (!filePath) return null;

    try {
      const stats = await fsPromises.stat(filePath);
      const contentType = await detectContentType(filePath, reference);

      const info: FileInfo = {
        name: reference,
        size: stats.size,
        lastModified: stats.mtime,
      };
      if (contentType) {
        info.contentType = contentType;
      }
      return info;
    } catch {
      return null;
    }
  }

  /**
   * Lists files in local storage with optional prefix filtering and pagination.
   */
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
      
      if (decodedPrefix && (decodedPrefix.includes('..') || decodedPrefix.includes('\0'))) {
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
