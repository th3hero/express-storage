import fs from 'fs';
import path from 'path';
import { BaseStorageDriver } from './base.driver.js';
import { FileUploadResult, PresignedUrlResult } from '../types/storage.types.js';
import { createMonthBasedPath, ensureDirectoryExists, createLocalFileUrl } from '../utils/file.utils.js';

/**
 * Local storage driver for file system storage
 */
export class LocalStorageDriver extends BaseStorageDriver {
  private basePath: string;

  constructor(config: any) {
    super(config);
    this.basePath = config.localPath || 'public/express-storage';
  }

  /**
   * Upload file to local storage
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
      
      // Create month-based directory path
      const monthPath = createMonthBasedPath(this.basePath);
      const fullDirPath = path.resolve(monthPath);
      
      // Ensure directory exists
      ensureDirectoryExists(fullDirPath);
      
      // Create full file path
      const filePath = path.join(fullDirPath, fileName);
      
      // Write file to disk
      fs.writeFileSync(filePath, file.buffer);
      
      // Generate relative URL
      const relativePath = path.relative('public', filePath);
      const fileUrl = createLocalFileUrl(relativePath);
      
      return this.createSuccessResult(fileName, fileUrl);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Failed to upload file'
      );
    }
  }

  /**
   * Generate upload URL (not supported for local storage)
   */
  async generateUploadUrl(_fileName: string): Promise<PresignedUrlResult> {
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
   */
  async delete(fileName: string): Promise<boolean> {
    try {
      // Find file in month directories
      const filePath = this.findFilePath(fileName);
      
      if (!filePath) {
        return false;
      }
      
      // Delete file
      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find file path by searching through month directories
   */
  private findFilePath(fileName: string): string | null {
    const baseDir = path.resolve(this.basePath);
    
    if (!fs.existsSync(baseDir)) {
      return null;
    }
    
    // Search through all subdirectories
    const searchDirectories = (dir: string): string | null => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          // Recursively search subdirectories
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


} 