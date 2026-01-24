/**
 * Local Storage Driver Test Suite
 * 
 * Comprehensive tests for the LocalStorageDriver.
 * Covers: uploads, deletions, listings, security validations, edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LocalStorageDriver } from '../src/drivers/local.driver.js';
import type { StorageConfig } from '../src/types/storage.types.js';
import {
  createMockFile,
  createMockJpegFile,
  createMockPngFile,
  createMockPdfFile,
  createMockExeFile,
  createEmptyMockFile,
  createDiskStorageMockFile,
  PATH_TRAVERSAL_CASES,
} from './fixtures/test-helpers.js';

const TEST_BASE_PATH = path.join(process.cwd(), 'test-local-driver');

function createDriver(overrides: Partial<StorageConfig> = {}): LocalStorageDriver {
  return new LocalStorageDriver({
    driver: 'local',
    localPath: TEST_BASE_PATH,
    ...overrides,
  });
}

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

describe('LocalStorageDriver', () => {
  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_BASE_PATH)) {
      fs.rmSync(TEST_BASE_PATH, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_BASE_PATH)) {
      fs.rmSync(TEST_BASE_PATH, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // POSITIVE TEST CASES - Upload
  // ============================================================================

  describe('Upload - Positive', () => {
    it('should upload a file successfully', async () => {
      const driver = createDriver();
      const file = createMockFile({ originalname: 'test.txt' });

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
      expect(result.fileName).toBeDefined();
      expect(result.fileUrl).toBeDefined();
    });

    it('should create year/month directory structure', async () => {
      const driver = createDriver();
      const file = createMockFile();

      const result = await driver.upload(file);

      expect(result.success).toBe(true);

      // Check directory structure exists
      const now = new Date();
      const year = now.getUTCFullYear().toString();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const expectedDir = path.join(TEST_BASE_PATH, year, month);

      expect(fs.existsSync(expectedDir)).toBe(true);
    });

    it('should generate unique filename', async () => {
      const driver = createDriver();
      const file1 = createMockFile({ originalname: 'test.txt' });
      const file2 = createMockFile({ originalname: 'test.txt' });

      const result1 = await driver.upload(file1);
      const result2 = await driver.upload(file2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.fileName).not.toBe(result2.fileName);
    });

    it('should preserve file extension', async () => {
      const driver = createDriver();
      const file = createMockFile({ originalname: 'image.jpg' });

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
      expect(result.fileName).toContain('.jpg');
    });

    it('should handle JPEG file', async () => {
      const driver = createDriver();
      const file = createMockJpegFile();

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should handle PNG file', async () => {
      const driver = createDriver();
      const file = createMockPngFile();

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should handle PDF file', async () => {
      const driver = createDriver();
      const file = createMockPdfFile();

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should handle dotfiles', async () => {
      const driver = createDriver();
      const file = createMockFile({ originalname: '.gitignore' });

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should upload multiple files', async () => {
      const driver = createDriver();
      const files = [
        createMockFile({ originalname: 'file1.txt' }),
        createMockFile({ originalname: 'file2.txt' }),
        createMockFile({ originalname: 'file3.txt' }),
      ];

      const results = await driver.uploadMultiple(files);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle disk storage files', async () => {
      const driver = createDriver();

      // Create a temp file
      const tempPath = path.join(TEST_BASE_PATH, 'temp-upload.txt');
      fs.mkdirSync(TEST_BASE_PATH, { recursive: true });
      fs.writeFileSync(tempPath, 'disk storage content');

      const file = createDiskStorageMockFile({
        originalname: 'disk-file.txt',
        path: tempPath,
        size: 20,
      });

      const result = await driver.upload(file);

      expect(result.success).toBe(true);

      // Cleanup temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    });

    it('should generate correct URL with public prefix', async () => {
      const driver = createDriver({ localPath: 'public/uploads' });
      const file = createMockFile();

      // Need to actually create the directory for upload to work
      const publicUploads = path.join(process.cwd(), 'public', 'uploads');
      fs.mkdirSync(publicUploads, { recursive: true });

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
      expect(result.fileUrl).toMatch(/^\/uploads\//);

      // Cleanup
      fs.rmSync(path.join(process.cwd(), 'public'), { recursive: true, force: true });
    });
  });

  // ============================================================================
  // NEGATIVE TEST CASES - Upload
  // ============================================================================

  describe('Upload - Negative', () => {
    it('should fail for null file', async () => {
      const driver = createDriver();

      const result = await driver.upload(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No file provided');
    });

    it('should fail for file without originalname', async () => {
      const driver = createDriver();
      const file = createMockFile();
      (file as any).originalname = undefined;

      const result = await driver.upload(file);

      expect(result.success).toBe(false);
    });

    it('should fail for file without mimetype', async () => {
      const driver = createDriver();
      const file = createMockFile();
      (file as any).mimetype = undefined;

      const result = await driver.upload(file);

      expect(result.success).toBe(false);
    });

    it('should fail for empty file', async () => {
      const driver = createDriver();
      const file = createEmptyMockFile();

      const result = await driver.upload(file);

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should fail for file without buffer or path', async () => {
      const driver = createDriver();
      const file = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 100,
        buffer: undefined,
        path: undefined,
      } as any;

      const result = await driver.upload(file);

      expect(result.success).toBe(false);
    });

    it('should return empty array for empty files array', async () => {
      const driver = createDriver();

      const results = await driver.uploadMultiple([]);

      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // SECURITY TESTS - Path Traversal
  // ============================================================================

  describe('Security - Path Traversal Prevention', () => {
    it('should reject path traversal in delete', async () => {
      const driver = createDriver();

      for (const maliciousPath of PATH_TRAVERSAL_CASES) {
        const result = await driver.delete(maliciousPath);
        expect(result).toBe(false);
      }
    });

    it('should reject path traversal in list prefix', async () => {
      const driver = createDriver();

      for (const maliciousPath of PATH_TRAVERSAL_CASES.slice(0, 5)) {
        const result = await driver.listFiles(maliciousPath);
        expect(result.success).toBe(false);
      }
    });

    it('should reject path traversal in validateAndConfirmUpload', async () => {
      const driver = createDriver();

      for (const maliciousPath of PATH_TRAVERSAL_CASES.slice(0, 5)) {
        const result = await driver.validateAndConfirmUpload(maliciousPath);
        expect(result.success).toBe(false);
      }
    });

    it('should prevent directory escape via relative path', async () => {
      const driver = createDriver();
      fs.mkdirSync(TEST_BASE_PATH, { recursive: true });

      // Create a file outside the base path
      const outsidePath = path.join(process.cwd(), 'outside-file.txt');
      fs.writeFileSync(outsidePath, 'sensitive data');

      // Try to delete via relative path
      const deleted = await driver.delete('../outside-file.txt');

      expect(deleted).toBe(false);
      expect(fs.existsSync(outsidePath)).toBe(true);

      // Cleanup
      fs.unlinkSync(outsidePath);
    });
  });

  // ============================================================================
  // SECURITY TESTS - Symlink Protection
  // ============================================================================

  describe('Security - Symlink Protection', () => {
    it('should not delete symlinks', async () => {
      const driver = createDriver();
      fs.mkdirSync(TEST_BASE_PATH, { recursive: true });

      // Create a real file and a symlink to it
      const realFile = path.join(TEST_BASE_PATH, 'real-file.txt');
      const symlink = path.join(TEST_BASE_PATH, 'symlink.txt');

      fs.writeFileSync(realFile, 'real content');
      fs.symlinkSync(realFile, symlink);

      // Try to delete the symlink
      const deleted = await driver.delete('symlink.txt');

      expect(deleted).toBe(false);
      expect(fs.existsSync(symlink)).toBe(true);
      expect(fs.existsSync(realFile)).toBe(true);
    });

    it('should not list symlinks', async () => {
      const driver = createDriver();
      fs.mkdirSync(TEST_BASE_PATH, { recursive: true });

      // Create real file and symlink
      const realFile = path.join(TEST_BASE_PATH, 'real.txt');
      const symlink = path.join(TEST_BASE_PATH, 'link.txt');

      fs.writeFileSync(realFile, 'content');
      fs.symlinkSync(realFile, symlink);

      const result = await driver.listFiles();

      expect(result.success).toBe(true);
      // Only real file should be listed
      expect(result.files?.some(f => f.name === 'real.txt')).toBe(true);
      expect(result.files?.some(f => f.name === 'link.txt')).toBe(false);
    });

    it('should not validate symlinks', async () => {
      const driver = createDriver();
      fs.mkdirSync(TEST_BASE_PATH, { recursive: true });

      const realFile = path.join(TEST_BASE_PATH, 'real.txt');
      const symlink = path.join(TEST_BASE_PATH, 'symlink.txt');

      fs.writeFileSync(realFile, 'content');
      fs.symlinkSync(realFile, symlink);

      const result = await driver.validateAndConfirmUpload('symlink.txt');

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // CONTENT TYPE DETECTION TESTS
  // ============================================================================

  describe('Content Type Detection', () => {
    it('should detect JPEG from magic bytes', async () => {
      const driver = createDriver();
      const file = createMockJpegFile({ originalname: 'image.jpg' });

      const uploadResult = await driver.upload(file);
      expect(uploadResult.success).toBe(true);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!);

      expect(validation.success).toBe(true);
      expect(validation.actualContentType).toBe('image/jpeg');
    });

    it('should detect PNG from magic bytes', async () => {
      const driver = createDriver();
      const file = createMockPngFile({ originalname: 'image.png' });

      const uploadResult = await driver.upload(file);
      expect(uploadResult.success).toBe(true);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!);

      expect(validation.success).toBe(true);
      expect(validation.actualContentType).toBe('image/png');
    });

    it('should detect PDF from magic bytes', async () => {
      const driver = createDriver();
      const file = createMockPdfFile({ originalname: 'document.pdf' });

      const uploadResult = await driver.upload(file);
      expect(uploadResult.success).toBe(true);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!);

      expect(validation.success).toBe(true);
      expect(validation.actualContentType).toBe('application/pdf');
    });

    it('should detect executable files', async () => {
      const driver = createDriver();
      // Create exe disguised as jpg
      const file = createMockExeFile({ originalname: 'image.jpg' });

      const uploadResult = await driver.upload(file);
      expect(uploadResult.success).toBe(true);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!);

      expect(validation.success).toBe(true);
      // Magic bytes should detect exe, not jpg
      expect(validation.actualContentType).toBe('application/x-msdownload');
    });

    it('should fall back to extension when magic bytes unknown', async () => {
      const driver = createDriver();
      // Create a file with unknown magic bytes
      const file = createMockFile({
        originalname: 'data.json',
        mimetype: 'application/json',
        buffer: Buffer.from('{"key": "value"}'),
      });

      const uploadResult = await driver.upload(file);
      expect(uploadResult.success).toBe(true);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!);

      expect(validation.success).toBe(true);
      expect(validation.actualContentType).toBe('application/json');
    });
  });

  // ============================================================================
  // VALIDATION TESTS
  // ============================================================================

  describe('Validate and Confirm Upload', () => {
    it('should validate file existence', async () => {
      const driver = createDriver();
      const file = createMockFile();

      const uploadResult = await driver.upload(file);
      expect(uploadResult.success).toBe(true);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!);

      expect(validation.success).toBe(true);
      expect(validation.reference).toBe(uploadResult.fileName);
      expect(validation.viewUrl).toBeDefined();
      expect(validation.actualFileSize).toBeGreaterThan(0);
    });

    it('should validate expected content type', async () => {
      const driver = createDriver();
      const file = createMockJpegFile();

      const uploadResult = await driver.upload(file);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!, {
        expectedContentType: 'image/jpeg',
      });

      expect(validation.success).toBe(true);
    });

    it('should fail validation for wrong content type', async () => {
      const driver = createDriver();
      const file = createMockJpegFile();

      const uploadResult = await driver.upload(file);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!, {
        expectedContentType: 'image/png',
      });

      expect(validation.success).toBe(false);
      expect(validation.error).toContain('Content type mismatch');
    });

    it('should validate expected file size', async () => {
      const driver = createDriver();
      const buffer = Buffer.from('test content');
      const file = createMockFile({ buffer, size: buffer.length });

      const uploadResult = await driver.upload(file);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!, {
        expectedFileSize: buffer.length,
      });

      expect(validation.success).toBe(true);
    });

    it('should fail validation for wrong file size', async () => {
      const driver = createDriver();
      const file = createMockFile({ buffer: Buffer.from('content'), size: 7 });

      const uploadResult = await driver.upload(file);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!, {
        expectedFileSize: 1000,
      });

      expect(validation.success).toBe(false);
      expect(validation.error).toContain('File size mismatch');
    });

    it('should delete file on validation failure by default', async () => {
      const driver = createDriver();
      const file = createMockJpegFile();

      const uploadResult = await driver.upload(file);
      const filePath = uploadResult.fileName!;

      await driver.validateAndConfirmUpload(filePath, {
        expectedContentType: 'image/png', // Wrong type
      });

      // File should be deleted
      const exists = await driver.validateAndConfirmUpload(filePath);
      expect(exists.success).toBe(false);
    });

    it('should keep file on validation failure when deleteOnFailure is false', async () => {
      const driver = createDriver();
      const file = createMockJpegFile();

      const uploadResult = await driver.upload(file);
      const filePath = uploadResult.fileName!;

      await driver.validateAndConfirmUpload(filePath, {
        expectedContentType: 'image/png',
        deleteOnFailure: false,
      });

      // File should still exist
      const exists = await driver.validateAndConfirmUpload(filePath);
      expect(exists.success).toBe(true);
    });

    it('should fail for non-existent file', async () => {
      const driver = createDriver();

      const validation = await driver.validateAndConfirmUpload('non-existent.txt');

      expect(validation.success).toBe(false);
      expect(validation.error).toContain('not found');
    });
  });

  // ============================================================================
  // DELETION TESTS
  // ============================================================================

  describe('Deletion', () => {
    it('should delete uploaded file', async () => {
      const driver = createDriver();
      const file = createMockFile();

      const uploadResult = await driver.upload(file);
      expect(uploadResult.success).toBe(true);

      const deleted = await driver.delete(uploadResult.fileName!);

      expect(deleted).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const driver = createDriver();

      const deleted = await driver.delete('non-existent.txt');

      expect(deleted).toBe(false);
    });

    it('should not delete directories', async () => {
      const driver = createDriver();
      const dirPath = path.join(TEST_BASE_PATH, 'subdir');
      fs.mkdirSync(dirPath, { recursive: true });

      const deleted = await driver.delete('subdir');

      expect(deleted).toBe(false);
    });

    it('should delete multiple files', async () => {
      const driver = createDriver();

      const result1 = await driver.upload(createMockFile({ originalname: 'file1.txt' }));
      const result2 = await driver.upload(createMockFile({ originalname: 'file2.txt' }));

      const results = await driver.deleteMultiple([result1.fileName!, result2.fileName!]);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should return empty array for empty delete array', async () => {
      const driver = createDriver();

      const results = await driver.deleteMultiple([]);

      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // LISTING TESTS
  // ============================================================================

  describe('File Listing', () => {
    it('should list uploaded files', async () => {
      const driver = createDriver();

      await driver.upload(createMockFile({ originalname: 'file1.txt' }));
      await driver.upload(createMockFile({ originalname: 'file2.txt' }));

      const result = await driver.listFiles();

      expect(result.success).toBe(true);
      expect(result.files!.length).toBeGreaterThanOrEqual(2);
    });

    it('should include file metadata', async () => {
      const driver = createDriver();
      const buffer = Buffer.from('test content');
      const file = createMockFile({ buffer, size: buffer.length });

      await driver.upload(file);

      const result = await driver.listFiles();

      expect(result.success).toBe(true);
      const uploadedFile = result.files![0];
      expect(uploadedFile.size).toBe(buffer.length);
      expect(uploadedFile.lastModified).toBeInstanceOf(Date);
      expect(uploadedFile.contentType).toBeDefined();
    });

    it('should filter by prefix', async () => {
      const driver = createDriver();
      fs.mkdirSync(path.join(TEST_BASE_PATH, 'subdir'), { recursive: true });

      // Create files directly in subdir
      fs.writeFileSync(path.join(TEST_BASE_PATH, 'subdir', 'filtered.txt'), 'content');
      fs.writeFileSync(path.join(TEST_BASE_PATH, 'other.txt'), 'content');

      const result = await driver.listFiles('subdir/');

      expect(result.success).toBe(true);
      expect(result.files!.every(f => f.name.startsWith('subdir/'))).toBe(true);
    });

    it('should support pagination with maxResults', async () => {
      const driver = createDriver();
      fs.mkdirSync(TEST_BASE_PATH, { recursive: true });

      // Create multiple files
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(TEST_BASE_PATH, `file${i}.txt`), 'content');
      }

      const result = await driver.listFiles(undefined, 2);

      expect(result.success).toBe(true);
      expect(result.files!.length).toBe(2);
      expect(result.nextToken).toBeDefined();
    });

    it('should support continuation token', async () => {
      const driver = createDriver();
      fs.mkdirSync(TEST_BASE_PATH, { recursive: true });

      // Create files
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(TEST_BASE_PATH, `file${i}.txt`), 'content');
      }

      const result1 = await driver.listFiles(undefined, 2);
      expect(result1.nextToken).toBeDefined();

      const result2 = await driver.listFiles(undefined, 2, result1.nextToken);

      expect(result2.success).toBe(true);
      expect(result2.files!.length).toBeGreaterThan(0);
      // Files should be different
      expect(result2.files![0].name).not.toBe(result1.files![0].name);
    });

    it('should return empty array for empty directory', async () => {
      const driver = createDriver();

      const result = await driver.listFiles();

      expect(result.success).toBe(true);
      expect(result.files).toEqual([]);
    });

    it('should validate maxResults bounds', async () => {
      const driver = createDriver();
      fs.mkdirSync(TEST_BASE_PATH, { recursive: true });

      // Create many files
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(TEST_BASE_PATH, `file${i}.txt`), 'content');
      }

      // Request more than 1000 should be capped
      const result = await driver.listFiles(undefined, 2000);

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // PRESIGNED URL TESTS (Local driver doesn't support these)
  // ============================================================================

  describe('Presigned URLs', () => {
    it('should return error for generateUploadUrl', async () => {
      const driver = createDriver();

      const result = await driver.generateUploadUrl('test.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported');
    });

    it('should return error for generateViewUrl', async () => {
      const driver = createDriver();

      const result = await driver.generateViewUrl('test.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle files with special characters in name', async () => {
      const driver = createDriver();
      const file = createMockFile({ originalname: 'file with spaces & (special).txt' });

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should handle very long filenames', async () => {
      const driver = createDriver();
      const longName = 'a'.repeat(200) + '.txt';
      const file = createMockFile({ originalname: longName });

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should handle unicode filenames', async () => {
      const driver = createDriver();
      const file = createMockFile({ originalname: '文件名.txt' });

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should handle emoji filenames', async () => {
      const driver = createDriver();
      const file = createMockFile({ originalname: '📄document.pdf' });

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should handle base path with trailing slash', async () => {
      const driver = createDriver({ localPath: TEST_BASE_PATH + '/' });
      const file = createMockFile();

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should handle empty bucket path', async () => {
      const driver = createDriver({ bucketPath: '' });
      const file = createMockFile();

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });

    it('should handle bucket path with leading/trailing slashes', async () => {
      const driver = createDriver({ bucketPath: '/subfolder/' });
      const file = createMockFile();

      const result = await driver.upload(file);

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // PRESIGNED URL EXPIRY TESTS
  // ============================================================================

  describe('Presigned URL Expiry', () => {
    it('should use default expiry', () => {
      const driver = createDriver();
      // Access protected method via any
      const expiry = (driver as any).getPresignedUrlExpiry();

      expect(expiry).toBe(600); // Default is 10 minutes
    });

    it('should use configured expiry', () => {
      const driver = createDriver({ presignedUrlExpiry: 3600 });
      const expiry = (driver as any).getPresignedUrlExpiry();

      expect(expiry).toBe(3600);
    });

    it('should clamp expiry to minimum', () => {
      const driver = createDriver({ presignedUrlExpiry: 0 });
      const expiry = (driver as any).getPresignedUrlExpiry();

      expect(expiry).toBe(1);
    });

    it('should clamp expiry to maximum', () => {
      const driver = createDriver({ presignedUrlExpiry: 1000000 });
      const expiry = (driver as any).getPresignedUrlExpiry();

      expect(expiry).toBe(604800); // 7 days
    });
  });
});
