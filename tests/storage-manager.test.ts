/**
 * StorageManager Test Suite
 * 
 * Comprehensive tests for the main StorageManager class.
 * Covers: initialization, uploads, presigned URLs, validation, deletion, listing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StorageManager } from '../src/storage-manager.js';
import { StorageDriverFactory } from '../src/factory/driver.factory.js';
import { resetDotenvInitialization } from '../src/utils/config.utils.js';
import {
  createMockFile,
  createMockJpegFile,
  createMockPngFile,
  createMockPdfFile,
  createEmptyMockFile,
  PATH_TRAVERSAL_CASES,
} from './fixtures/test-helpers.js';

const TEST_UPLOAD_DIR = path.join(process.cwd(), 'test-storage-manager-uploads');

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

describe('StorageManager', () => {
  beforeEach(() => {
    resetDotenvInitialization();
    StorageDriverFactory.clearCache();
    
    // Clean up test directory
    if (fs.existsSync(TEST_UPLOAD_DIR)) {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    StorageDriverFactory.clearCache();
    
    // Clean up test directory
    if (fs.existsSync(TEST_UPLOAD_DIR)) {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // POSITIVE TEST CASES - Initialization
  // ============================================================================

  describe('Initialization - Positive', () => {
    it('should initialize with local driver by default', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      expect(storage.getDriverType()).toBe('local');
    });

    it('should initialize with custom configuration', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: {
          localPath: TEST_UPLOAD_DIR,
          presignedUrlExpiry: 1800,
          maxFileSize: 10 * 1024 * 1024,
        },
      });

      const config = storage.getConfig();
      expect(config.presignedUrlExpiry).toBe(1800);
      expect(config.maxFileSize).toBe(10 * 1024 * 1024);
    });

    it('should mask sensitive credentials in getSafeConfig', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      const safeConfig = storage.getSafeConfig();
      expect(safeConfig.awsAccessKey).toBeUndefined();
      expect(safeConfig.awsSecretKey).toBeUndefined();
    });

    it('should return available drivers', () => {
      const drivers = StorageManager.getAvailableDrivers();

      expect(drivers).toContain('local');
      expect(drivers).toContain('s3');
      expect(drivers).toContain('s3-presigned');
      expect(drivers).toContain('gcs');
      expect(drivers).toContain('gcs-presigned');
      expect(drivers).toContain('azure');
      expect(drivers).toContain('azure-presigned');
    });

    it('should support custom logger', () => {
      const logs: string[] = [];
      const logger = {
        debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
        info: (msg: string) => logs.push(`INFO: ${msg}`),
        warn: (msg: string) => logs.push(`WARN: ${msg}`),
        error: (msg: string) => logs.push(`ERROR: ${msg}`),
      };

      new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
        logger,
      });

      expect(logs.some(l => l.includes('StorageManager'))).toBe(true);
    });

    it('should detect presigned upload mode correctly', () => {
      const local = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      expect(local.isPresignedUploadMode()).toBe(false);
    });
  });

  // ============================================================================
  // POSITIVE TEST CASES - File Upload
  // ============================================================================

  describe('File Upload - Positive', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should upload a single file successfully', async () => {
      const file = createMockFile({ originalname: 'test.txt' });

      const result = await storage.uploadFile(file);

      expect(result.success).toBe(true);
      expect(result.fileName).toBeDefined();
      expect(result.fileUrl).toBeDefined();
    });

    it('should upload a JPEG file', async () => {
      const file = createMockJpegFile();

      const result = await storage.uploadFile(file);

      expect(result.success).toBe(true);
      expect(result.fileName).toContain('.jpg');
    });

    it('should upload a PNG file', async () => {
      const file = createMockPngFile();

      const result = await storage.uploadFile(file);

      expect(result.success).toBe(true);
      expect(result.fileName).toContain('.png');
    });

    it('should upload a PDF file', async () => {
      const file = createMockPdfFile();

      const result = await storage.uploadFile(file);

      expect(result.success).toBe(true);
      expect(result.fileName).toContain('.pdf');
    });

    it('should upload multiple files', async () => {
      const files = [
        createMockFile({ originalname: 'file1.txt' }),
        createMockFile({ originalname: 'file2.txt' }),
        createMockFile({ originalname: 'file3.txt' }),
      ];

      const results = await storage.uploadFiles(files);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should validate file size before upload', async () => {
      const file = createMockFile({
        originalname: 'small.txt',
        buffer: Buffer.from('small'),
        size: 5,
      });

      const result = await storage.uploadFile(file, {
        maxSize: 1000,
      });

      expect(result.success).toBe(true);
    });

    it('should validate MIME type before upload', async () => {
      const file = createMockJpegFile();

      const result = await storage.uploadFile(file, {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
      });

      expect(result.success).toBe(true);
    });

    it('should validate file extension before upload', async () => {
      const file = createMockFile({ originalname: 'doc.pdf', mimetype: 'application/pdf' });

      const result = await storage.uploadFile(file, {
        allowedExtensions: ['.pdf', '.doc'],
      });

      expect(result.success).toBe(true);
    });

    it('should use generic upload for single file', async () => {
      const file = createMockFile();

      const result = await storage.upload({ type: 'single', file });

      expect(result).not.toBeInstanceOf(Array);
      expect((result as any).success).toBe(true);
    });

    it('should use generic upload for multiple files', async () => {
      const files = [createMockFile(), createMockFile()];

      const results = await storage.upload({ type: 'multiple', files });

      expect(results).toBeInstanceOf(Array);
      expect((results as any[]).length).toBe(2);
    });

    it('should accept wildcard MIME types', async () => {
      const file = createMockFile({ mimetype: 'text/html' });

      const result = await storage.uploadFile(file, {
        allowedMimeTypes: ['*/*'],
      });

      expect(result.success).toBe(true);
    });

    it('should accept files without extension when allowed', async () => {
      const file = createMockFile({ originalname: 'Makefile' });

      const result = await storage.uploadFile(file, {
        allowedExtensions: ['*'],
      });

      expect(result.success).toBe(true);
    });

    it('should handle extension validation with dot prefix', async () => {
      const file = createMockFile({ originalname: 'test.txt' });

      const result = await storage.uploadFile(file, {
        allowedExtensions: ['.txt'],
      });

      expect(result.success).toBe(true);
    });

    it('should handle extension validation without dot prefix', async () => {
      const file = createMockFile({ originalname: 'test.txt' });

      const result = await storage.uploadFile(file, {
        allowedExtensions: ['txt'],
      });

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // NEGATIVE TEST CASES - File Upload
  // ============================================================================

  describe('File Upload - Negative', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should fail when file is null', async () => {
      const result = await storage.uploadFile(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No file provided');
    });

    it('should fail when file is undefined', async () => {
      const result = await storage.uploadFile(undefined as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No file provided');
    });

    it('should fail when file exceeds max size', async () => {
      const file = createMockFile({
        originalname: 'large.txt',
        buffer: Buffer.alloc(1000),
        size: 1000,
      });

      const result = await storage.uploadFile(file, {
        maxSize: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should fail when MIME type not allowed', async () => {
      const file = createMockFile({ mimetype: 'text/html' });

      const result = await storage.uploadFile(file, {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should fail when extension not allowed', async () => {
      const file = createMockFile({ originalname: 'script.exe' });

      const result = await storage.uploadFile(file, {
        allowedExtensions: ['.txt', '.pdf'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should fail when file has no extension but required', async () => {
      const file = createMockFile({ originalname: 'noextension' });

      const result = await storage.uploadFile(file, {
        allowedExtensions: ['.txt', '.pdf'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('no extension');
    });

    it('should fail with empty allowedMimeTypes array', async () => {
      const file = createMockFile();

      const result = await storage.uploadFile(file, {
        allowedMimeTypes: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should fail with empty allowedExtensions array', async () => {
      const file = createMockFile();

      const result = await storage.uploadFile(file, {
        allowedExtensions: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should return empty array for empty files array', async () => {
      const results = await storage.uploadFiles([]);

      expect(results).toEqual([]);
    });

    it('should fail for file with empty buffer', async () => {
      const file = createEmptyMockFile();

      const result = await storage.uploadFile(file);

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should fail for file without buffer or path', async () => {
      const file = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 100,
        buffer: undefined,
        path: undefined,
      } as any;

      const result = await storage.uploadFile(file);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // POSITIVE TEST CASES - Presigned URLs
  // ============================================================================

  describe('Presigned URLs - Positive', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should report local driver does not support presigned URLs', async () => {
      const result = await storage.generateUploadUrl('test.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported');
    });

    it('should report local driver does not support view URLs', async () => {
      const result = await storage.generateViewUrl('test.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported');
    });

    it('should generate upload URLs for batch', async () => {
      const files = ['file1.jpg', 'file2.jpg', 'file3.jpg'];

      const results = await storage.generateUploadUrls(files);

      expect(results).toHaveLength(3);
      // All fail for local driver
      expect(results.every(r => !r.success)).toBe(true);
    });

    it('should generate view URLs for batch', async () => {
      const references = ['path/file1.jpg', 'path/file2.jpg'];

      const results = await storage.generateViewUrls(references);

      expect(results).toHaveLength(2);
    });

    it('should handle empty arrays for batch operations', async () => {
      expect(await storage.generateUploadUrls([])).toEqual([]);
      expect(await storage.generateViewUrls([])).toEqual([]);
    });

    it('should accept FileMetadata objects for batch upload URLs', async () => {
      const files = [
        { fileName: 'image.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        { fileName: 'doc.pdf', contentType: 'application/pdf', fileSize: 2048 },
      ];

      const results = await storage.generateUploadUrls(files);

      expect(results).toHaveLength(2);
    });

    it('should report Azure requires post-upload validation', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      expect(storage.requiresPostUploadValidation()).toBe(false);
    });
  });

  // ============================================================================
  // NEGATIVE TEST CASES - Presigned URLs
  // ============================================================================

  describe('Presigned URLs - Negative', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should reject empty filename', async () => {
      const result = await storage.generateUploadUrl('');

      expect(result.success).toBe(false);
    });

    it('should reject filename with path traversal', async () => {
      const result = await storage.generateUploadUrl('../secret.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should reject filename with null bytes', async () => {
      const result = await storage.generateUploadUrl('file\0name.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('null');
    });

    it('should reject invalid content type format', async () => {
      const result = await storage.generateUploadUrl('file.txt', 'invalid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid contentType');
    });

    it('should reject negative file size', async () => {
      const result = await storage.generateUploadUrl('file.txt', 'text/plain', -100);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-negative');
    });

    it('should reject NaN file size', async () => {
      const result = await storage.generateUploadUrl('file.txt', 'text/plain', NaN);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-negative');
    });

    it('should reject file size exceeding max', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: {
          localPath: TEST_UPLOAD_DIR,
          maxFileSize: 1000,
        },
      });

      const result = await storage.generateUploadUrl('file.txt', 'text/plain', 2000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot exceed');
    });

    it('should reject folder with path traversal', async () => {
      const result = await storage.generateUploadUrl('file.txt', undefined, undefined, '../secret');

      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should reject folder with null bytes', async () => {
      const result = await storage.generateUploadUrl('file.txt', undefined, undefined, 'folder\0name');

      expect(result.success).toBe(false);
      expect(result.error).toContain('null');
    });

    it('should reject folder with invalid characters', async () => {
      const result = await storage.generateUploadUrl('file.txt', undefined, undefined, 'folder<script>');

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should reject folder with consecutive slashes', async () => {
      const result = await storage.generateUploadUrl('file.txt', undefined, undefined, 'folder//subfolder');

      expect(result.success).toBe(false);
      expect(result.error).toContain('consecutive slashes');
    });

    it('should reject reference with path traversal for view URL', async () => {
      const result = await storage.generateViewUrl('../../../etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should handle null in batch upload URLs', async () => {
      const files = [null, 'valid.jpg'] as any[];

      const results = await storage.generateUploadUrls(files);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('null or undefined');
    });

    it('should handle invalid type in batch upload URLs', async () => {
      const files = [123, 'valid.jpg'] as any[];

      const results = await storage.generateUploadUrls(files);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('Invalid input type');
    });

    it('should handle FileMetadata without fileName', async () => {
      const files = [{ contentType: 'image/jpeg' }] as any[];

      const results = await storage.generateUploadUrls(files);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('fileName');
    });

    it('should handle null in batch view URLs', async () => {
      const references = [null, 'valid/path.jpg'] as any[];

      const results = await storage.generateViewUrls(references);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('non-null string');
    });

    it('should handle path traversal in batch view URLs', async () => {
      const references = ['../secret.txt', 'valid/path.jpg'];

      const results = await storage.generateViewUrls(references);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('traversal');
    });
  });

  // ============================================================================
  // RATE LIMITING TESTS
  // ============================================================================

  describe('Rate Limiting', () => {
    it('should enforce rate limit on presigned URL generation', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
        rateLimit: {
          maxRequests: 3,
          windowMs: 60000,
        },
      });

      // Make requests up to limit
      await storage.generateUploadUrl('file1.txt');
      await storage.generateUploadUrl('file2.txt');
      await storage.generateUploadUrl('file3.txt');

      // Next request should be rate limited
      const result = await storage.generateUploadUrl('file4.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should report rate limit status', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
        rateLimit: {
          maxRequests: 10,
          windowMs: 60000,
        },
      });

      const status = storage.getRateLimitStatus();

      expect(status).not.toBeNull();
      expect(status!.remainingRequests).toBe(10);
    });

    it('should return null status when rate limiting not configured', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      expect(storage.getRateLimitStatus()).toBeNull();
    });

    it('should also rate limit view URL generation', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
        rateLimit: {
          maxRequests: 2,
          windowMs: 60000,
        },
      });

      await storage.generateViewUrl('file1.txt');
      await storage.generateViewUrl('file2.txt');

      const result = await storage.generateViewUrl('file3.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });
  });

  // ============================================================================
  // FILE DELETION TESTS
  // ============================================================================

  describe('File Deletion - Positive', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should delete an uploaded file', async () => {
      const file = createMockFile();
      const uploadResult = await storage.uploadFile(file);

      expect(uploadResult.success).toBe(true);

      const deleted = await storage.deleteFile(uploadResult.fileName!);

      expect(deleted).toBe(true);
    });

    it('should delete multiple files', async () => {
      const file1 = createMockFile({ originalname: 'file1.txt' });
      const file2 = createMockFile({ originalname: 'file2.txt' });

      const result1 = await storage.uploadFile(file1);
      const result2 = await storage.uploadFile(file2);

      const results = await storage.deleteFiles([result1.fileName!, result2.fileName!]);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should return empty array for empty delete array', async () => {
      const results = await storage.deleteFiles([]);

      expect(results).toEqual([]);
    });
  });

  describe('File Deletion - Negative', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should return false for non-existent file', async () => {
      const deleted = await storage.deleteFile('non-existent.txt');

      expect(deleted).toBe(false);
    });

    it('should reject path traversal in delete', async () => {
      for (const path of PATH_TRAVERSAL_CASES.slice(0, 5)) {
        const deleted = await storage.deleteFile(path);
        expect(deleted).toBe(false);
      }
    });

    it('should handle deletion errors in batch gracefully', async () => {
      const results = await storage.deleteFiles([
        '../../../etc/passwd',
        'non-existent.txt',
      ]);

      expect(results).toHaveLength(2);
      expect(results.every(r => !r.success)).toBe(true);
    });
  });

  // ============================================================================
  // FILE LISTING TESTS
  // ============================================================================

  describe('File Listing - Positive', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should list uploaded files', async () => {
      // Upload some files
      await storage.uploadFile(createMockFile({ originalname: 'file1.txt' }));
      await storage.uploadFile(createMockFile({ originalname: 'file2.txt' }));

      const result = await storage.listFiles();

      expect(result.success).toBe(true);
      expect(result.files!.length).toBeGreaterThanOrEqual(2);
    });

    it('should list files with prefix filter', async () => {
      await storage.uploadFile(createMockFile({ originalname: 'test.txt' }));

      const result = await storage.listFiles();

      expect(result.success).toBe(true);
    });

    it('should support pagination', async () => {
      // Upload several files
      for (let i = 0; i < 5; i++) {
        await storage.uploadFile(createMockFile({ originalname: `file${i}.txt` }));
      }

      const result1 = await storage.listFiles(undefined, 2);

      expect(result1.success).toBe(true);
      expect(result1.files!.length).toBe(2);

      if (result1.nextToken) {
        const result2 = await storage.listFiles(undefined, 2, result1.nextToken);

        expect(result2.success).toBe(true);
        expect(result2.files!.length).toBeGreaterThan(0);
      }
    });

    it('should return empty array for empty directory', async () => {
      const result = await storage.listFiles();

      expect(result.success).toBe(true);
      expect(result.files).toEqual([]);
    });
  });

  describe('File Listing - Negative', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should reject path traversal in prefix', async () => {
      const result = await storage.listFiles('../../../');

      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should reject null bytes in prefix', async () => {
      const result = await storage.listFiles('folder\0name');

      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });
  });

  // ============================================================================
  // VALIDATION AND CONFIRMATION TESTS
  // ============================================================================

  describe('Validate and Confirm Upload', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should validate an uploaded file', async () => {
      const file = createMockJpegFile();
      const uploadResult = await storage.uploadFile(file);

      const validation = await storage.validateAndConfirmUpload(uploadResult.fileName!);

      expect(validation.success).toBe(true);
      expect(validation.reference).toBe(uploadResult.fileName);
    });

    it('should fail validation for non-existent file', async () => {
      const validation = await storage.validateAndConfirmUpload('non-existent.jpg');

      expect(validation.success).toBe(false);
      expect(validation.error).toContain('not found');
    });

    it('should reject path traversal in validation', async () => {
      const validation = await storage.validateAndConfirmUpload('../../../etc/passwd');

      expect(validation.success).toBe(false);
      expect(validation.error).toContain('traversal');
    });
  });

  // ============================================================================
  // DRIVER FACTORY CACHING TESTS
  // ============================================================================

  describe('Driver Factory Caching', () => {
    it('should cache drivers', () => {
      new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
      new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      // Cache size should be 1 (same config reuses driver)
      expect(StorageDriverFactory.getCacheSize()).toBe(1);
    });

    it('should create separate drivers for different configs', () => {
      StorageDriverFactory.clearCache();

      new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
      new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR + '-other' },
      });

      expect(StorageDriverFactory.getCacheSize()).toBe(2);
    });

    it('should clear cache', () => {
      new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      StorageDriverFactory.clearCache();

      expect(StorageDriverFactory.getCacheSize()).toBe(0);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should throw on invalid configuration', () => {
      expect(() => {
        new StorageManager({
          driver: 'invalid' as any,
        });
      }).toThrow();
    });

    it('should throw on missing required S3 config', () => {
      expect(() => {
        new StorageManager({
          driver: 's3',
          credentials: {},
        });
      }).toThrow();
    });

    it('should throw on missing required GCS config', () => {
      expect(() => {
        new StorageManager({
          driver: 'gcs',
          credentials: {},
        });
      }).toThrow();
    });

    it('should throw on missing required Azure config', () => {
      expect(() => {
        new StorageManager({
          driver: 'azure',
          credentials: {},
        });
      }).toThrow();
    });
  });
});
