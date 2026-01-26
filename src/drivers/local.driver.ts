import fs from 'fs';
import path from 'path';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, ListFilesResult, UploadOptions, FileInfo } from '../types/storage.types.js';
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
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mimeType: 'image/gif' }, // GIF87a
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mimeType: 'image/gif' }, // GIF89a
  { bytes: [0x52, 0x49, 0x46, 0x46], mimeType: 'image/webp' }, // RIFF (WebP container)
  { bytes: [0x42, 0x4D], mimeType: 'image/bmp' },
  // Documents
  { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: 'application/pdf' }, // %PDF
  { bytes: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/zip' }, // ZIP (also docx, xlsx, etc.)
  { bytes: [0x50, 0x4B, 0x05, 0x06], mimeType: 'application/zip' }, // Empty ZIP
  { bytes: [0x50, 0x4B, 0x07, 0x08], mimeType: 'application/zip' }, // Spanned ZIP
  // Archives
  { bytes: [0x1F, 0x8B], mimeType: 'application/gzip' },
  { bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], mimeType: 'application/vnd.rar' }, // RAR
  { bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], mimeType: 'application/x-7z-compressed' }, // 7z
  // Audio/Video
  { bytes: [0x49, 0x44, 0x33], mimeType: 'audio/mpeg' }, // ID3 (MP3)
  { bytes: [0xFF, 0xFB], mimeType: 'audio/mpeg' }, // MP3 without ID3
  { bytes: [0xFF, 0xFA], mimeType: 'audio/mpeg' }, // MP3 without ID3
  { bytes: [0x4F, 0x67, 0x67, 0x53], mimeType: 'audio/ogg' }, // OGG
  { bytes: [0x66, 0x74, 0x79, 0x70], mimeType: 'video/mp4', offset: 4 }, // ftyp (MP4/M4A)
  // Executables (for security detection)
  { bytes: [0x4D, 0x5A], mimeType: 'application/x-msdownload' }, // EXE/DLL
  { bytes: [0x7F, 0x45, 0x4C, 0x46], mimeType: 'application/x-executable' }, // ELF
];

/**
 * Detects MIME type from file content using magic bytes.
 * Returns undefined if no match is found (falls back to extension-based detection).
 * 
 * @param filePath - Path to the file to analyze
 * @returns Detected MIME type or undefined
 */
function detectMimeTypeFromMagicBytes(filePath: string): string | undefined {
  try {
    // Read first 16 bytes (enough for most magic numbers)
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    
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
    
    return undefined;
  } catch {
    return undefined;
  }
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
 * **Symlink behavior:** This driver explicitly rejects symlinks for security.
 * If a file is a symlink, it will not be read, deleted, or listed. This prevents
 * attackers from using symlinks to access files outside the storage directory.
 * 
 * Note: Local storage doesn't support presigned URLs since
 * there's no external service to sign requests against.
 */
export class LocalStorageDriver extends BaseStorageDriver {
  private basePath: string;

  constructor(config: StorageConfig) {
    super(config);
    this.basePath = config.localPath || 'public/express-storage';
  }

  /**
   * Saves a file to the local filesystem.
   * 
   * Files are automatically organized into YYYY/MM folders.
   * For example, a file uploaded in January 2026 goes into:
   * {basePath}/2026/01/{unique_filename}.jpg
   * 
   * For large files (>100MB), uses streaming to reduce memory usage
   * and prevent application crashes.
   */
  async upload(file: Express.Multer.File, _options?: UploadOptions): Promise<FileUploadResult> {
    try {
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '));
      }

      const fileName = this.generateFileName(file.originalname);
      const monthPath = createMonthBasedPath(this.basePath);
      const fullDirPath = path.resolve(monthPath);
      
      ensureDirectoryExists(fullDirPath);
      
      const filePath = path.join(fullDirPath, fileName);
      
      // Use streaming for large files to reduce memory usage
      if (this.shouldUseStreaming(file)) {
        await this.uploadWithStream(file, filePath);
      } else {
        const fileContent = this.getFileContent(file);
        fs.writeFileSync(filePath, fileContent);
      }
      
      const fileUrl = this.generateFileUrl(filePath);
      
      // Return relative path from basePath (e.g., '2026/01/filename.jpg')
      const absoluteFilePath = path.resolve(filePath);
      const absoluteBasePath = path.resolve(this.basePath);
      const relativePath = this.normalizePathSeparators(
        path.relative(absoluteBasePath, absoluteFilePath)
      );
      
      return this.createSuccessResult(relativePath, fileUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file'
      );
    }
  }

  /**
   * Uploads a large file using streaming.
   * 
   * This method pipes the file stream directly to disk, which is more
   * memory-efficient for large files (>100MB).
   */
  private async uploadWithStream(file: Express.Multer.File, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = this.getFileStream(file);
      const writeStream = fs.createWriteStream(filePath);

      readStream
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', (err) => {
          // Clean up partial file on error
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch {
            // Ignore cleanup errors
          }
          reject(err);
        });

      // Handle read stream errors
      readStream.on('error', (err) => {
        writeStream.destroy();
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // Ignore cleanup errors
        }
        reject(err);
      });
    });
  }

  /**
   * Builds a URL for accessing the file.
   * 
   * If your basePath starts with 'public/', we strip that prefix
   * since Express.static('public') serves files from /
   * 
   * Example: public/uploads/2026/01/photo.jpg -> /uploads/2026/01/photo.jpg
   */
  private generateFileUrl(filePath: string): string {
    const absoluteFilePath = path.resolve(filePath);
    const absoluteBasePath = path.resolve(this.basePath);
    const relativeFromBase = this.normalizePathSeparators(
      path.relative(absoluteBasePath, absoluteFilePath)
    );
    
    const normalizedBasePath = this.normalizePathSeparators(this.basePath);
    
    if (normalizedBasePath.startsWith('public/')) {
      const webBasePath = normalizedBasePath.replace(/^public\//, '');
      return this.normalizeUrl(`/${webBasePath}/${relativeFromBase}`);
    }
    
    return this.normalizeUrl(`/${normalizedBasePath}/${relativeFromBase}`);
  }

  /**
   * Converts Windows backslashes to forward slashes.
   */
  private normalizePathSeparators(pathStr: string): string {
    return pathStr.replace(/\\/g, '/');
  }

  /**
   * Removes duplicate slashes from URLs.
   */
  private normalizeUrl(url: string): string {
    return url.replace(/\/+/g, '/');
  }

  /**
   * Local storage doesn't support presigned upload URLs.
   */
  async generateUploadUrl(_fileName: string, _contentType?: string, _maxSize?: number): Promise<PresignedUrlResult> {
    return this.createPresignedErrorResult(
      'Presigned URLs are not supported for local storage'
    );
  }

  /**
   * Local storage doesn't support presigned view URLs.
   */
  async generateViewUrl(_fileName: string): Promise<PresignedUrlResult> {
    return this.createPresignedErrorResult(
      'Presigned URLs are not supported for local storage'
    );
  }

  /**
   * Validates a local file exists and matches expected values.
   * 
   * Content type detection uses a two-tier approach:
   * 1. Magic byte detection (examines actual file content for security)
   * 2. Extension-based fallback (when magic bytes don't match)
   * 
   * This helps detect extension spoofing attacks where a malicious file
   * is renamed with an innocent extension (e.g., malware.exe -> photo.jpg).
   */
  override async validateAndConfirmUpload(
    reference: string,
    options?: import('../types/storage.types.js').BlobValidationOptions
  ): Promise<import('../types/storage.types.js').BlobValidationResult> {
    const deleteOnFailure = options?.deleteOnFailure !== false;
    
    try {
      const filePath = this.resolveFilePath(reference);
      
      if (!filePath || !fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'File not found',
        };
      }
      
      const stats = fs.statSync(filePath);
      const fileUrl = this.generateFileUrl(filePath);
      
      // Try magic byte detection first (more secure), fall back to extension
      const magicMimeType = detectMimeTypeFromMagicBytes(filePath);
      const ext = path.extname(reference).toLowerCase();
      const extensionMimeType = ext && EXTENSION_MIME_MAP[ext] ? EXTENSION_MIME_MAP[ext] : undefined;
      
      // Use magic bytes if detected, otherwise fall back to extension
      const actualContentType = magicMimeType || extensionMimeType;
      const actualFileSize = stats.size;
      
      // Security check: warn if magic bytes differ from extension (potential spoofing)
      const contentTypeMismatchWarning = magicMimeType && extensionMimeType && 
        magicMimeType !== extensionMimeType;

      // Validate content type if expected
      if (options?.expectedContentType && actualContentType !== options.expectedContentType) {
        if (deleteOnFailure) {
          await this.delete(reference);
        }
        const mismatchDetail = contentTypeMismatchWarning 
          ? ` (Warning: file extension suggests '${extensionMimeType}' but actual content is '${magicMimeType}')`
          : '';
        const errorResult: import('../types/storage.types.js').BlobValidationResult = {
          success: false,
          error: `Content type mismatch: expected '${options.expectedContentType}', got '${actualContentType || 'unknown'}'${mismatchDetail}${deleteOnFailure ? ' (file deleted)' : ' (file kept for inspection)'}`,
        };
        if (actualContentType) errorResult.actualContentType = actualContentType;
        errorResult.actualFileSize = actualFileSize;
        return errorResult;
      }

      // Validate file size if expected
      if (options?.expectedFileSize !== undefined && actualFileSize !== options.expectedFileSize) {
        if (deleteOnFailure) {
          await this.delete(reference);
        }
        const errorResult: import('../types/storage.types.js').BlobValidationResult = {
          success: false,
          error: `File size mismatch: expected ${options.expectedFileSize} bytes, got ${actualFileSize} bytes${deleteOnFailure ? ' (file deleted)' : ' (file kept for inspection)'}`,
        };
        if (actualContentType) errorResult.actualContentType = actualContentType;
        errorResult.actualFileSize = actualFileSize;
        return errorResult;
      }
      
      const result: import('../types/storage.types.js').BlobValidationResult = {
        success: true,
        reference,
        viewUrl: fileUrl,
        actualFileSize,
      };
      
      if (actualContentType) {
        result.actualContentType = actualContentType;
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate upload',
      };
    }
  }

  /**
   * Deletes a file from local storage.
   * 
   * Security checks:
   * - Rejects path traversal attempts (../ sequences)
   * - Rejects null bytes in paths
   * - Verifies target stays within base directory
   * - Won't follow or delete symlinks (security: prevents directory escape attacks)
   * - Only deletes regular files (not directories)
   * 
   * @param reference - The file path relative to the storage base directory
   * @returns true if file was deleted, false if not found or security check failed
   */
  async delete(reference: string): Promise<boolean> {
    try {
      // Decode URL-encoded characters first to catch encoded traversal attempts like %2e%2e%2f
      let decodedReference: string;
      try {
        decodedReference = decodeURIComponent(reference);
      } catch {
        return false;
      }
      
      if (decodedReference.includes('..') || decodedReference.includes('\0')) {
        return false;
      }
      
      const baseDir = path.resolve(this.basePath);
      const targetPath = path.join(baseDir, decodedReference);
      const resolvedPath = path.resolve(targetPath);
      
      // Make sure we're not escaping the base directory
      if (!resolvedPath.startsWith(baseDir + path.sep) && resolvedPath !== baseDir) {
        return false;
      }
      
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(resolvedPath);
      } catch {
        return false;
      }
      
      // Don't follow symlinks — security protection against:
      // 1. Directory escape attacks (symlink pointing outside storage)
      // 2. Unauthorized file deletion via symlink redirection
      // 3. Race conditions where symlink is swapped after check
      if (stat.isSymbolicLink()) {
        return false;
      }
      
      if (!stat.isFile()) {
        return false;
      }
      
      fs.unlinkSync(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely resolves a reference to a file path within our base directory.
   * Returns null for any suspicious input.
   */
  private resolveFilePath(reference: string): string | null {
    const baseDir = path.resolve(this.basePath);
    
    // Decode URL-encoded characters first to catch encoded traversal attempts like %2e%2e%2f
    let decodedReference: string;
    try {
      decodedReference = decodeURIComponent(reference);
    } catch {
      return null;
    }
    
    if (decodedReference.includes('..') || decodedReference.includes('\0')) {
      return null;
    }
    
    const directPath = path.join(baseDir, decodedReference);
    const resolvedPath = path.resolve(directPath);
    
    if (!resolvedPath.startsWith(baseDir + path.sep) && resolvedPath !== baseDir) {
      return null;
    }
    
    try {
      const stat = fs.lstatSync(directPath);
      
      if (stat.isSymbolicLink()) {
        return null;
      }
      
      if (stat.isFile()) {
        return directPath;
      }
    } catch {
      return null;
    }
    
    return null;
  }

  /**
   * Lists files in local storage with optional prefix filtering and pagination.
   * 
   * Uses early termination to avoid loading all files into memory when possible.
   * Files are collected in sorted order and iteration stops once we have enough
   * results for the requested page.
   */
  async listFiles(
    prefix?: string,
    maxResults: number = 1000,
    continuationToken?: string
  ): Promise<ListFilesResult> {
    try {
      // Decode URL-encoded characters first to catch encoded traversal attempts like %2e%2e%2f
      let decodedPrefix: string | undefined;
      if (prefix) {
        try {
          decodedPrefix = decodeURIComponent(prefix);
        } catch {
          return {
            success: false,
            error: 'Invalid prefix: malformed URL encoding',
          };
        }
      }
      
      if (decodedPrefix && (decodedPrefix.includes('..') || decodedPrefix.includes('\0'))) {
        return {
          success: false,
          error: 'Invalid prefix: path traversal sequences are not allowed',
        };
      }
      
      const validatedMaxResults = Math.floor(Math.max(1, Math.min(
        Number.isNaN(maxResults) ? 1000 : maxResults, 
        1000
      )));
      
      const baseDir = path.resolve(this.basePath);
      
      if (!fs.existsSync(baseDir)) {
        return { success: true, files: [] };
      }

      const matchingFiles: FileInfo[] = [];
      let hasMore = false;
      
      // Maximum recursion depth to prevent stack overflow on deeply nested directories
      const MAX_RECURSION_DEPTH = 100;
      
      // Maximum files to collect before stopping (for memory protection)
      // We collect a bit more than needed for accurate hasMore detection
      const MAX_COLLECT = validatedMaxResults + 1;
      
      // Use decoded prefix for file matching
      const effectivePrefix = decodedPrefix;
      
      // Skip directories that can't possibly contain matching files
      const couldContainPrefix = (dirRelativePath: string, targetPrefix: string): boolean => {
        if (!targetPrefix) return true;
        return targetPrefix.startsWith(dirRelativePath) || 
               dirRelativePath.startsWith(targetPrefix) ||
               dirRelativePath === '';
      };
      
      // Check if we should skip this file based on continuation token
      const isAfterToken = (filePath: string, token: string | undefined): boolean => {
        if (!token) return true;
        return filePath.localeCompare(token) > 0;
      };
      
      const collectFiles = (dir: string, dirRelativePath: string, depth: number = 0): boolean => {
        // Return true to continue, false to stop early
        
        // Prevent stack overflow from extremely deep directory structures
        if (depth > MAX_RECURSION_DEPTH) {
          return true;
        }
        
        // Early termination: we have enough files
        if (matchingFiles.length >= MAX_COLLECT) {
          hasMore = true;
          return false;
        }
        
        if (effectivePrefix && !couldContainPrefix(dirRelativePath, effectivePrefix)) {
          return true;
        }
        
        let items: string[];
        try {
          items = fs.readdirSync(dir);
        } catch {
          return true;
        }
        
        // Sort items for consistent ordering
        items.sort();
        
        for (const item of items) {
          // Check if we have enough files
          if (matchingFiles.length >= MAX_COLLECT) {
            hasMore = true;
            return false;
          }
          
          const itemPath = path.join(dir, item);
          const relativePath = dirRelativePath ? `${dirRelativePath}/${item}` : item;
          
          let stat: fs.Stats;
          try {
            stat = fs.lstatSync(itemPath);
          } catch {
            continue;
          }
          
          // Skip symlinks for security reasons:
          // 1. Symlinks could point outside the storage directory (directory escape)
          // 2. Symlinks could create infinite loops in directory traversal
          // 3. Symlinks could expose sensitive files from other locations
          // If you need symlink support, use a different storage strategy
          if (stat.isSymbolicLink()) {
            continue;
          }
          
          if (stat.isDirectory()) {
            // Skip directories that are lexicographically before our continuation token
            // (they can't contain files we need)
            if (continuationToken && !couldContainPrefix(relativePath, continuationToken.split('/')[0] || '')) {
              // Only skip if this directory is completely before the token
              if (relativePath.localeCompare(continuationToken) < 0 && !continuationToken.startsWith(relativePath + '/')) {
                continue;
              }
            }
            
            const shouldContinue = collectFiles(itemPath, relativePath, depth + 1);
            if (!shouldContinue) {
              return false;
            }
          } else if (stat.isFile()) {
            if (effectivePrefix && !relativePath.startsWith(effectivePrefix)) {
              continue;
            }
            
            // Skip files at or before the continuation token
            if (!isAfterToken(relativePath, continuationToken)) {
              continue;
            }
            
            const fileInfo: FileInfo = {
              name: relativePath,
              size: stat.size,
              lastModified: stat.mtime,
            };
            
            const ext = path.extname(relativePath).toLowerCase();
            if (ext && EXTENSION_MIME_MAP[ext]) {
              fileInfo.contentType = EXTENSION_MIME_MAP[ext];
            } else {
              fileInfo.contentType = 'application/octet-stream';
            }
            
            matchingFiles.push(fileInfo);
          }
        }
        
        return true;
      };

      collectFiles(baseDir, '');
      
      // Sort results (should already be mostly sorted due to directory traversal order)
      matchingFiles.sort((a, b) => a.name.localeCompare(b.name));
      
      // Take only the requested number of results
      const pageFiles = matchingFiles.slice(0, validatedMaxResults);
      
      const result: ListFilesResult = {
        success: true,
        files: pageFiles,
      };
      
      // Set next token if there are more results
      if (matchingFiles.length > validatedMaxResults || hasMore) {
        const lastFile = pageFiles[pageFiles.length - 1];
        if (lastFile) {
          result.nextToken = lastFile.name;
        }
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
