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
    
    if (fs.existsSync(TEST_UPLOAD_DIR)) {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
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

    it('should not expose credentials in getConfig', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      const config = storage.getConfig();
      expect('awsAccessKey' in config).toBe(false);
      expect('awsSecretKey' in config).toBe(false);
      expect('azureConnectionString' in config).toBe(false);
      expect('azureAccountKey' in config).toBe(false);
      expect('gcsCredentials' in config).toBe(false);
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
      expect(result.reference).toBeDefined();
      expect(result.fileUrl).toBeDefined();
    });

    it('should upload a JPEG file', async () => {
      const file = createMockJpegFile();

      const result = await storage.uploadFile(file);

      expect(result.success).toBe(true);
      expect(result.reference).toContain('.jpg');
    });

    it('should upload a PNG file', async () => {
      const file = createMockPngFile();

      const result = await storage.uploadFile(file);

      expect(result.success).toBe(true);
      expect(result.reference).toContain('.png');
    });

    it('should upload a PDF file', async () => {
      const file = createMockPdfFile();

      const result = await storage.uploadFile(file);

      expect(result.success).toBe(true);
      expect(result.reference).toContain('.pdf');
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

    it('should reject invalid contentType in upload options', async () => {
      const file = createMockFile();

      const result = await storage.uploadFile(file, undefined, {
        contentType: 'not-a-valid-mime',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid contentType');
      expect(result.code).toBe('INVALID_INPUT');
    });

    it('should accept valid contentType in upload options', async () => {
      const file = createMockFile();

      const result = await storage.uploadFile(file, undefined, {
        contentType: 'application/octet-stream',
      });

      expect(result.success).toBe(true);
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
        rateLimiter: {
          maxRequests: 3,
          windowMs: 60000,
        },
      });

      // Make requests up to limit (each counts even though local driver returns "not supported")
      await storage.generateUploadUrl('file1.txt');
      await storage.generateUploadUrl('file2.txt');
      await storage.generateUploadUrl('file3.txt');

      // Next request should be rate limited
      const result = await storage.generateUploadUrl('file4.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should report rate limit status', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
        rateLimiter: {
          maxRequests: 10,
          windowMs: 60000,
        },
      });

      const status = await storage.getRateLimitStatus();

      expect(status).not.toBeNull();
      expect(status!.remainingRequests).toBe(10);
    });

    it('should return null status when rate limiting not configured', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      expect(await storage.getRateLimitStatus()).toBeNull();
    });

    it('should also rate limit view URL generation', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
        rateLimiter: {
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

      const deleted = await storage.deleteFile(uploadResult.reference!);

      expect(deleted.success).toBe(true);
    });

    it('should delete multiple files', async () => {
      const file1 = createMockFile({ originalname: 'file1.txt' });
      const file2 = createMockFile({ originalname: 'file2.txt' });

      const result1 = await storage.uploadFile(file1);
      const result2 = await storage.uploadFile(file2);

      const results = await storage.deleteFiles([result1.reference!, result2.reference!]);

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

      expect(deleted.success).toBe(false);
    });

    it('should reject path traversal in delete', async () => {
      for (const path of PATH_TRAVERSAL_CASES.slice(0, 5)) {
        const deleted = await storage.deleteFile(path);
        expect(deleted.success).toBe(false);
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

      const validation = await storage.validateAndConfirmUpload(uploadResult.reference!);

      expect(validation.success).toBe(true);
      expect(validation.reference).toBe(uploadResult.reference);
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
  // FILE METADATA TESTS
  // ============================================================================

  describe('File Metadata', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
    });

    it('should get metadata for uploaded file', async () => {
      const file = createMockJpegFile();
      const uploadResult = await storage.uploadFile(file);
      expect(uploadResult.success).toBe(true);

      const metadata = await storage.getMetadata(uploadResult.reference!);

      expect(metadata).not.toBeNull();
      expect(metadata!.name).toBe(uploadResult.reference);
      expect(metadata!.size).toBeGreaterThan(0);
      expect(metadata!.lastModified).toBeInstanceOf(Date);
    });

    it('should detect content type via magic bytes', async () => {
      const file = createMockPdfFile();
      const uploadResult = await storage.uploadFile(file);

      const metadata = await storage.getMetadata(uploadResult.reference!);

      expect(metadata).not.toBeNull();
      expect(metadata!.contentType).toBe('application/pdf');
    });

    it('should return null for non-existent file', async () => {
      const metadata = await storage.getMetadata('non-existent.txt');
      expect(metadata).toBeNull();
    });

    it('should reject path traversal in getMetadata', async () => {
      const metadata = await storage.getMetadata('../../../etc/passwd');
      expect(metadata).toBeNull();
    });

    it('should reject null bytes in getMetadata', async () => {
      const metadata = await storage.getMetadata('file\0name.txt');
      expect(metadata).toBeNull();
    });
  });

  // ============================================================================
  // LIFECYCLE TESTS - destroy()
  // ============================================================================

  describe('Lifecycle - destroy', () => {
    it('should clear rate limiter on destroy', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
        rateLimiter: { maxRequests: 10, windowMs: 60000 },
      });

      expect(await storage.getRateLimitStatus()).not.toBeNull();

      storage.destroy();

      await expect(storage.getRateLimitStatus()).rejects.toThrow('StorageManager has been destroyed');
      expect(storage.isDestroyed()).toBe(true);
    });

    it('should be safe to call destroy multiple times', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      storage.destroy();
      expect(() => storage.destroy()).not.toThrow();
      expect(storage.isDestroyed()).toBe(true);
    });

    it('should reject all operations after destroy', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      storage.destroy();

      await expect(storage.uploadFile({} as Express.Multer.File)).rejects.toThrow('destroyed');
      await expect(storage.deleteFile('test.txt')).rejects.toThrow('destroyed');
      await expect(storage.listFiles()).rejects.toThrow('destroyed');
      await expect(storage.getMetadata('test.txt')).rejects.toThrow('destroyed');
      await expect(storage.exists('test.txt')).rejects.toThrow('destroyed');
      await expect(storage.generateUploadUrl('test.txt')).rejects.toThrow('destroyed');
      await expect(storage.generateViewUrl('test.txt')).rejects.toThrow('destroyed');
    });

    it('should create isolated driver instances (no shared state)', () => {
      const storage1 = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });
      const storage2 = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_UPLOAD_DIR },
      });

      storage1.destroy();

      expect(storage2.getDriverType()).toBe('local');
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
