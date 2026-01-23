import fs from 'fs';
import path from 'path';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult, StorageConfig, ListFilesResult, UploadOptions } from '../types/storage.types.js';
import { createMonthBasedPath, ensureDirectoryExists } from '../utils/file.utils.js';

/**
 * Local storage driver for file system storage
 */
export class LocalStorageDriver extends BaseStorageDriver {
  private basePath: string;

  constructor(config: StorageConfig) {
    super(config);
    this.basePath = config.localPath || 'public/express-storage';
  }

  /**
   * Upload file to local storage
   * Note: Local storage ignores upload options (metadata, cacheControl, etc.)
   */
  async upload(file: Express.Multer.File, _options?: UploadOptions): Promise<FileUploadResult> {
    try {
      // Validate file
      const validationErrors = this.validateFile(file);
      if (validationErrors.length > 0) {
        return this.createErrorResult(validationErrors.join(', '));
      }

      // Generate unique filename
      const fileName = this.generateFileName(file.originalname);
      
      // Create month-based directory path
      const monthPath = createMonthBasedPath(this.basePath);
      const fullDirPath = path.resolve(monthPath);
      
      // Ensure directory exists
      ensureDirectoryExists(fullDirPath);
      
      // Create full file path
      const filePath = path.join(fullDirPath, fileName);
      
      // Get file content (supports both memory and disk storage)
      const fileContent = this.getFileContent(file);
      
      // Write file to disk
      fs.writeFileSync(filePath, fileContent);
      
      // Generate URL based on configured base path
      const fileUrl = this.generateFileUrl(filePath);
      
      return this.createSuccessResult(fileName, fileUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file'
      );
    }
  }

  /**
   * Generate URL for a file based on configured base path
   * Handles both public/ and custom storage paths
   */
  private generateFileUrl(filePath: string): string {
    const absoluteFilePath = path.resolve(filePath);
    const absoluteBasePath = path.resolve(this.basePath);
    
    // Get the relative path from the base storage path and normalize to forward slashes
    const relativeFromBase = this.normalizePathSeparators(
      path.relative(absoluteBasePath, absoluteFilePath)
    );
    
    // Normalize basePath for comparison (handles Windows backslashes)
    const normalizedBasePath = this.normalizePathSeparators(this.basePath);
    
    // If basePath starts with 'public/', generate a web-accessible URL
    if (normalizedBasePath.startsWith('public/')) {
      // Remove 'public/' prefix to get web path
      const webBasePath = normalizedBasePath.replace(/^public\//, '');
      return this.normalizeUrl(`/${webBasePath}/${relativeFromBase}`);
    }
    
    // For custom paths outside public/, return a reference path
    // The application should handle serving these files
    return this.normalizeUrl(`/${normalizedBasePath}/${relativeFromBase}`);
  }

  /**
   * Normalize path separators to forward slashes (for URLs and cross-platform consistency)
   */
  private normalizePathSeparators(pathStr: string): string {
    return pathStr.replace(/\\/g, '/');
  }

  /**
   * Normalize URL by removing duplicate slashes
   */
  private normalizeUrl(url: string): string {
    return url.replace(/\/+/g, '/');
  }

  /**
   * Generate upload URL (not supported for local storage)
   */
  async generateUploadUrl(_fileName: string, _contentType?: string, _maxSize?: number): Promise<PresignedUrlResult> {
    return this.createPresignedErrorResult(
      'Presigned URLs are not supported for local storage'
    );
  }

  /**
   * Generate view URL (not supported for local storage)
   */
  async generateViewUrl(_fileName: string): Promise<PresignedUrlResult> {
    return this.createPresignedErrorResult(
      'Presigned URLs are not supported for local storage'
    );
  }

  /**
   * Delete file from local storage
   * @param reference - Can be just filename or relative path (e.g., 'january/2026/file.jpg')
   */
  async delete(reference: string): Promise<boolean> {
    try {
      const filePath = this.resolveFilePath(reference);
      
      if (!filePath || !fs.existsSync(filePath)) {
        return false;
      }
      
      // Delete file
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve file path from reference
   * Handles both full relative paths and just filenames
   */
  private resolveFilePath(reference: string): string | null {
    const baseDir = path.resolve(this.basePath);
    
    // First, try as a direct relative path from basePath
    const directPath = path.join(baseDir, reference);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
      return directPath;
    }
    
    // Fall back to searching by filename only (for backwards compatibility)
    const fileName = path.basename(reference);
    return this.findFileByName(baseDir, fileName);
  }

  /**
   * Find file by name searching through directories
   */
  private findFileByName(baseDir: string, fileName: string): string | null {
    if (!fs.existsSync(baseDir)) {
      return null;
    }
    
    const searchDirectories = (dir: string): string | null => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          const found = searchDirectories(itemPath);
          if (found) return found;
        } else if (item === fileName) {
          return itemPath;
        }
      }
      
      return null;
    };
    
    return searchDirectories(baseDir);
  }

  /**
   * List files in local storage with optional prefix filter and pagination
   * @param prefix - Filter files by prefix
   * @param maxResults - Maximum number of results per page
   * @param continuationToken - Filename to start after (for pagination)
   */
  async listFiles(
    prefix?: string,
    maxResults: number = 1000,
    continuationToken?: string
  ): Promise<ListFilesResult> {
    try {
      const baseDir = path.resolve(this.basePath);
      
      if (!fs.existsSync(baseDir)) {
        return { success: true, files: [] };
      }

      const allFiles: { name: string; size: number; lastModified: Date }[] = [];
      
      // Recursively collect all files
      const collectFiles = (dir: string): void => {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            collectFiles(itemPath);
          } else {
            const relativePath = path.relative(baseDir, itemPath);
            
            // Apply prefix filter if provided
            if (!prefix || relativePath.startsWith(prefix)) {
              allFiles.push({
                name: relativePath,
                size: stat.size,
                lastModified: stat.mtime,
              });
            }
          }
        }
      };

      collectFiles(baseDir);
      
      // Sort files by name for consistent pagination
      allFiles.sort((a, b) => a.name.localeCompare(b.name));
      
      // Apply pagination using continuation token (filename to start after)
      // Uses alphabetical comparison instead of exact match to handle deleted files gracefully
      let startIndex = 0;
      if (continuationToken) {
        // Find first file that comes after the token alphabetically
        // This handles the case where the token file was deleted between requests
        startIndex = allFiles.findIndex(f => f.name.localeCompare(continuationToken) > 0);
        if (startIndex === -1) {
          // All files are <= token, return empty result
          startIndex = allFiles.length;
        }
      }
      
      // Get the page of results
      const pageFiles = allFiles.slice(startIndex, startIndex + maxResults);
      
      const result: ListFilesResult = {
        success: true,
        files: pageFiles,
      };
      
      // Set next token if there are more results
      if (startIndex + maxResults < allFiles.length) {
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
