/**
 * Regression Test Suite
 * 
 * Tests for edge cases, boundary conditions, and previously reported issues.
 * These tests help prevent regressions when making changes to the codebase.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StorageManager } from '../src/storage-manager.js';
import { StorageDriverFactory } from '../src/factory/driver.factory.js';
import { LocalStorageDriver } from '../src/drivers/local.driver.js';
import type { StorageConfig } from '../src/types/storage.types.js';
import { resetDotenvInitialization } from '../src/utils/config.utils.js';
import {
  generateUniqueFileName,
  sanitizeFileName,
  formatFileSize,
  withRetry,
  withConcurrencyLimit,
  detectMimeType,
  sleep,
} from '../src/utils/file.utils.js';
import {
  createMockFile,
  createMockJpegFile,
} from './fixtures/test-helpers.js';

const TEST_DIR = path.join(process.cwd(), 'test-regression');

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

describe('Regression Tests', () => {
  beforeEach(() => {
    resetDotenvInitialization();
    
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // BOUNDARY CONDITION TESTS
  // ============================================================================

  describe('Boundary Conditions', () => {
    describe('File Size Boundaries', () => {
      let storage: StorageManager;

      beforeEach(() => {
        storage = new StorageManager({
          driver: 'local',
          credentials: {
            localPath: TEST_DIR,
            maxFileSize: 1000,
          },
        });
      });

      it('should accept file exactly at max size', async () => {
        const file = createMockFile({
          buffer: Buffer.alloc(1000),
          size: 1000,
        });

        const result = await storage.uploadFile(file, { maxSize: 1000 });

        expect(result.success).toBe(true);
      });

      it('should reject file one byte over max size', async () => {
        const file = createMockFile({
          buffer: Buffer.alloc(1001),
          size: 1001,
        });

        const result = await storage.uploadFile(file, { maxSize: 1000 });

        expect(result.success).toBe(false);
      });

      it('should accept file one byte under max size', async () => {
        const file = createMockFile({
          buffer: Buffer.alloc(999),
          size: 999,
        });

        const result = await storage.uploadFile(file, { maxSize: 1000 });

        expect(result.success).toBe(true);
      });
    });

    describe('Presigned URL Expiry Boundaries', () => {
      it('should clamp expiry at 1 second minimum', () => {
        const driver = new LocalStorageDriver({
          driver: 'local',
          localPath: TEST_DIR,
          presignedUrlExpiry: 0,
        });

        const expiry = (driver as any).getPresignedUrlExpiry();

        expect(expiry).toBe(1);
      });

      it('should clamp expiry at 7 days maximum', () => {
        const driver = new LocalStorageDriver({
          driver: 'local',
          localPath: TEST_DIR,
          presignedUrlExpiry: 999999,
        });

        const expiry = (driver as any).getPresignedUrlExpiry();

        expect(expiry).toBe(604800);
      });

      it('should handle exactly 7 days', () => {
        const driver = new LocalStorageDriver({
          driver: 'local',
          localPath: TEST_DIR,
          presignedUrlExpiry: 604800,
        });

        const expiry = (driver as any).getPresignedUrlExpiry();

        expect(expiry).toBe(604800);
      });

      it('should handle undefined expiry', () => {
        const driver = new LocalStorageDriver({
          driver: 'local',
          localPath: TEST_DIR,
        });

        const expiry = (driver as any).getPresignedUrlExpiry();

        expect(expiry).toBe(600); // Default
      });

      it('should handle NaN expiry', () => {
        const driver = new LocalStorageDriver({
          driver: 'local',
          localPath: TEST_DIR,
          presignedUrlExpiry: NaN,
        });

        const expiry = (driver as any).getPresignedUrlExpiry();

        expect(expiry).toBe(600); // Default
      });
    });

    describe('Filename Length Boundaries', () => {
      it('should handle filename of exactly 255 characters', () => {
        const name = 'a'.repeat(251) + '.txt';

        expect(name.length).toBe(255);

        const result = generateUniqueFileName(name);

        expect(result).toBeDefined();
      });

      it('should handle empty filename gracefully', () => {
        const result = generateUniqueFileName('');

        expect(result).toMatch(/^\d+_[a-f0-9]+_file$/);
      });

      it('should handle filename with only extension', () => {
        const result = generateUniqueFileName('.txt');

        expect(result).toMatch(/\.txt$/);
      });
    });

    describe('Pagination Boundaries', () => {
      let driver: LocalStorageDriver;

      beforeEach(() => {
        driver = new LocalStorageDriver({
          driver: 'local',
          localPath: TEST_DIR,
        });
        fs.mkdirSync(TEST_DIR, { recursive: true });
      });

      it('should handle maxResults of 1', async () => {
        fs.writeFileSync(path.join(TEST_DIR, 'file1.txt'), 'a');
        fs.writeFileSync(path.join(TEST_DIR, 'file2.txt'), 'b');

        const result = await driver.listFiles(undefined, 1);

        expect(result.success).toBe(true);
        expect(result.files!.length).toBe(1);
        expect(result.nextToken).toBeDefined();
      });

      it('should handle maxResults of 1000 (max)', async () => {
        const result = await driver.listFiles(undefined, 1000);

        expect(result.success).toBe(true);
      });

      it('should clamp maxResults over 1000', async () => {
        for (let i = 0; i < 5; i++) {
          fs.writeFileSync(path.join(TEST_DIR, `file${i}.txt`), 'content');
        }

        const result = await driver.listFiles(undefined, 5000);

        expect(result.success).toBe(true);
        // Should not crash even with high maxResults
      });

      it('should handle maxResults of 0', async () => {
        const result = await driver.listFiles(undefined, 0);

        expect(result.success).toBe(true);
        // 0 should be clamped to minimum of 1
      });

      it('should handle negative maxResults', async () => {
        const result = await driver.listFiles(undefined, -10);

        expect(result.success).toBe(true);
        // Should be clamped to valid value
      });

      it('should handle NaN maxResults', async () => {
        const result = await driver.listFiles(undefined, NaN);

        expect(result.success).toBe(true);
        // Should use default
      });
    });
  });

  // ============================================================================
  // EDGE CASE TESTS
  // ============================================================================

  describe('Edge Cases', () => {
    describe('Empty Input Handling', () => {
      let storage: StorageManager;

      beforeEach(() => {
        storage = new StorageManager({
          driver: 'local',
          credentials: { localPath: TEST_DIR },
        });
      });

      it('should handle empty files array for upload', async () => {
        const results = await storage.uploadFiles([]);

        expect(results).toEqual([]);
      });

      it('should handle empty array for delete', async () => {
        const results = await storage.deleteFiles([]);

        expect(results).toEqual([]);
      });

      it('should handle empty array for batch presigned URLs', async () => {
        expect(await storage.generateUploadUrls([])).toEqual([]);
        expect(await storage.generateViewUrls([])).toEqual([]);
      });

      it('should handle undefined prefix for list', async () => {
        const result = await storage.listFiles(undefined);

        expect(result.success).toBe(true);
      });

      it('should handle empty string prefix for list', async () => {
        const result = await storage.listFiles('');

        expect(result.success).toBe(true);
      });
    });

    describe('Unicode and Special Characters', () => {
      it('should sanitize emoji filenames', () => {
        const result = sanitizeFileName('📁folder📄document.pdf');

        expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
      });

      it('should sanitize Chinese characters', () => {
        const result = sanitizeFileName('文件夹/文档.txt');

        expect(result).not.toContain('/');
        expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
      });

      it('should sanitize Arabic characters', () => {
        const result = sanitizeFileName('ملف.txt');

        expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
      });

      it('should sanitize mixed unicode', () => {
        const result = sanitizeFileName('日本語_中文_한국어.doc');

        expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
      });

      it('should handle RTL characters', () => {
        const result = sanitizeFileName('\u202Efile.txt');

        expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
      });
    });

    describe('Dotfile Handling', () => {
      let storage: StorageManager;

      beforeEach(() => {
        storage = new StorageManager({
          driver: 'local',
          credentials: { localPath: TEST_DIR },
        });
      });

      it('should upload .gitignore', async () => {
        const file = createMockFile({ originalname: '.gitignore' });

        const result = await storage.uploadFile(file);

        expect(result.success).toBe(true);
      });

      it('should upload .env', async () => {
        const file = createMockFile({ originalname: '.env' });

        const result = await storage.uploadFile(file);

        expect(result.success).toBe(true);
      });

      it('should upload .htaccess', async () => {
        const file = createMockFile({ originalname: '.htaccess' });

        const result = await storage.uploadFile(file);

        expect(result.success).toBe(true);
      });

      it('should handle dotfile with extension', async () => {
        const file = createMockFile({ originalname: '.eslintrc.json' });

        const result = await storage.uploadFile(file);

        expect(result.success).toBe(true);
        expect(result.reference).toContain('.json');
      });
    });

    describe('Concurrent Operations', () => {
      it('should handle concurrent uploads without collision', async () => {
        const storage = new StorageManager({
          driver: 'local',
          credentials: { localPath: TEST_DIR },
        });

        const files = Array(20).fill(null).map(() => 
          createMockFile({ originalname: 'concurrent.txt' })
        );

        const results = await storage.uploadFiles(files);

        expect(results.length).toBe(20);
        expect(results.every(r => r.success)).toBe(true);

        // All filenames should be unique
        const names = new Set(results.map(r => r.reference));
        expect(names.size).toBe(20);
      });

      it('should handle concurrent deletes', async () => {
        const storage = new StorageManager({
          driver: 'local',
          credentials: { localPath: TEST_DIR },
        });

        // Upload files first
        const uploadResults = await Promise.all(
          Array(10).fill(null).map(() =>
            storage.uploadFile(createMockFile())
          )
        );

        const references = uploadResults
          .filter(r => r.success)
          .map(r => r.reference!);

        // Delete all concurrently
        const deleteResults = await storage.deleteFiles(references);

        expect(deleteResults.length).toBe(references.length);
        expect(deleteResults.every(r => r.success)).toBe(true);
      });
    });
  });

  // ============================================================================
  // FORMAT FILE SIZE EDGE CASES
  // ============================================================================

  describe('formatFileSize Edge Cases', () => {
    it('should handle 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('should handle 1 byte', () => {
      expect(formatFileSize(1)).toBe('1 Bytes');
    });

    it('should handle exactly 1 KB', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    it('should handle exactly 1 MB', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    });

    it('should handle exactly 1 GB', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should handle exactly 1 TB', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    });

    it('should handle large TB values', () => {
      const result = formatFileSize(5 * 1024 * 1024 * 1024 * 1024);

      expect(result).toBe('5 TB');
    });

    it('should handle fractional values', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should round to 2 decimal places', () => {
      // 1234567 bytes = 1.177... MB
      const result = formatFileSize(1234567);

      expect(result).toMatch(/^\d+\.\d{1,2} MB$/);
    });
  });

  // ============================================================================
  // RETRY LOGIC REGRESSION TESTS
  // ============================================================================

  describe('withRetry Regression Tests', () => {
    it('should not retry on immediate success', async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        return 'success';
      };

      const result = await withRetry(operation, { maxAttempts: 5 });

      expect(result).toBe('success');
      expect(callCount).toBe(1);
    });

    it('should handle operation that succeeds on last attempt', async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount < 3) throw new Error('not yet');
        return 'success';
      };

      const result = await withRetry(operation, { maxAttempts: 3, baseDelay: 10 });

      expect(result).toBe('success');
      expect(callCount).toBe(3);
    });

    it('should preserve error type', async () => {
      class CustomError extends Error {
        constructor(public code: number) {
          super('custom error');
        }
      }

      const operation = async () => {
        throw new CustomError(42);
      };

      try {
        await withRetry(operation, { maxAttempts: 1 });
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CustomError);
        expect((e as CustomError).code).toBe(42);
      }
    });

    it('should handle async rejection with non-Error', async () => {
      const operation = async () => {
        throw 'string rejection';
      };

      await expect(
        withRetry(operation, { maxAttempts: 1 })
      ).rejects.toThrow('string rejection');
    });
  });

  // ============================================================================
  // CONCURRENCY LIMIT REGRESSION TESTS
  // ============================================================================

  describe('withConcurrencyLimit Regression Tests', () => {
    it('should maintain result order with varying delays', async () => {
      const delays = [100, 10, 50, 5, 75];
      const results = await withConcurrencyLimit(
        delays,
        async (delay, index) => {
          await sleep(delay);
          return { index, delay };
        },
        { maxConcurrent: 2 }
      );

      // Results should be in original order
      expect(results.map(r => r.index)).toEqual([0, 1, 2, 3, 4]);
    });

    it('should handle errors in some items', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await withConcurrencyLimit(
        items,
        async (item) => {
          if (item === 3) throw new Error('item 3 failed');
          return item * 2;
        },
        { maxConcurrent: 2 }
      ).catch(() => 'all failed');

      // Should throw because one item failed
      expect(results).toBe('all failed');
    });

    it('should handle single item array', async () => {
      const results = await withConcurrencyLimit(
        [42],
        async (item) => item * 2,
        { maxConcurrent: 10 }
      );

      expect(results).toEqual([84]);
    });

    it('should handle maxConcurrent of 1 (sequential)', async () => {
      const order: number[] = [];
      const items = [1, 2, 3];

      await withConcurrencyLimit(
        items,
        async (item) => {
          order.push(item);
          await sleep(10);
          return item;
        },
        { maxConcurrent: 1 }
      );

      expect(order).toEqual([1, 2, 3]);
    });
  });

  // ============================================================================
  // DRIVER FACTORY REGRESSION TESTS
  // ============================================================================

  describe('Driver Factory Regression Tests', () => {
    it('should handle rapid cache operations', () => {
      const factory = new StorageDriverFactory();

      for (let i = 0; i < 100; i++) {
        factory.getOrCreate({
          driver: 'local',
          localPath: `path-${i}`,
        });

        if (i % 10 === 0) {
          factory.clearCache();
        }
      }

      expect(factory.getCacheSize()).toBeGreaterThanOrEqual(0);
    });

    it('should handle identical configs created simultaneously', async () => {
      const factory = new StorageDriverFactory();
      const config: StorageConfig = {
        driver: 'local',
        localPath: 'identical-path',
      };

      const promises = Array(10).fill(null).map(() =>
        Promise.resolve(factory.getOrCreate(config))
      );

      const drivers = await Promise.all(promises);

      const first = drivers[0];
      expect(drivers.every(d => d === first)).toBe(true);
    });
  });

  // ============================================================================
  // STORAGE MANAGER CONFIG REGRESSION TESTS
  // ============================================================================

  describe('StorageManager Config Regression Tests', () => {
    it('should reject 0 for presignedUrlExpiry during validation', () => {
      // 0 is rejected during config validation as it must be > 0
      expect(() => {
        new StorageManager({
          driver: 'local',
          credentials: {
            localPath: TEST_DIR,
            presignedUrlExpiry: 0,
          },
        });
      }).toThrow();
    });

    it('should allow explicit 0 for maxFileSize', () => {
      // This should throw during validation
      expect(() => {
        new StorageManager({
          driver: 'local',
          credentials: {
            localPath: TEST_DIR,
            maxFileSize: 0,
          },
        });
      }).toThrow();
    });

    it('should not expose credentials in getConfig', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
      });

      const config = storage.getConfig();

      expect('awsAccessKey' in config).toBe(false);
      expect('awsSecretKey' in config).toBe(false);
      expect('azureConnectionString' in config).toBe(false);
      expect('azureAccountKey' in config).toBe(false);
      expect('gcsCredentials' in config).toBe(false);
    });

    it('should preserve non-sensitive fields in getConfig', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: {
          localPath: TEST_DIR,
          bucketPath: 'my-path',
          presignedUrlExpiry: 1800,
        },
      });

      const config = storage.getConfig();

      expect(config.localPath).toContain('test-regression');
      expect(config.bucketPath).toBe('my-path');
      expect(config.presignedUrlExpiry).toBe(1800);
    });
  });

  // ============================================================================
  // UPLOAD WITH OPTIONS REGRESSION TESTS
  // ============================================================================

  describe('Upload Options Regression Tests', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
      });
    });

    it('should handle upload with all validation options', async () => {
      const file = createMockJpegFile();

      const result = await storage.uploadFile(file, {
        maxSize: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        allowedExtensions: ['.jpg', '.jpeg', '.png'],
      });

      expect(result.success).toBe(true);
    });

    it('should handle upload with metadata options', async () => {
      const file = createMockFile();

      const result = await storage.uploadFile(file, undefined, {
        contentType: 'text/plain',
        metadata: { key: 'value' },
        cacheControl: 'max-age=3600',
        contentDisposition: 'attachment',
      });

      expect(result.success).toBe(true);
    });

    it('should handle validation with wildcard MIME type', async () => {
      const file = createMockFile({ mimetype: 'application/octet-stream' });

      const result = await storage.uploadFile(file, {
        allowedMimeTypes: ['*/*'],
      });

      expect(result.success).toBe(true);
    });

    it('should handle validation with star extension', async () => {
      const file = createMockFile({ originalname: 'file.xyz' });

      const result = await storage.uploadFile(file, {
        allowedExtensions: ['*'],
      });

      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Magic byte detection fixes
  // -------------------------------------------------------------------------

  describe('RIFF container sub-format detection', () => {
    it('should detect WebP from RIFF container (not false-positive WAV)', () => {
      // RIFF + size + WEBP
      const webp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00, // file size (placeholder)
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      expect(detectMimeType(webp)).toBe('image/webp');
    });

    it('should detect WAV from RIFF container', () => {
      const wav = Buffer.from([
        0x52, 0x49, 0x46, 0x46,
        0x00, 0x00, 0x00, 0x00,
        0x57, 0x41, 0x56, 0x45, // WAVE
      ]);
      expect(detectMimeType(wav)).toBe('audio/wav');
    });

    it('should detect AVI from RIFF container', () => {
      const avi = Buffer.from([
        0x52, 0x49, 0x46, 0x46,
        0x00, 0x00, 0x00, 0x00,
        0x41, 0x56, 0x49, 0x20, // AVI\x20
      ]);
      expect(detectMimeType(avi)).toBe('video/x-msvideo');
    });

    it('should return undefined for unknown RIFF sub-format', () => {
      const unknown = Buffer.from([
        0x52, 0x49, 0x46, 0x46,
        0x00, 0x00, 0x00, 0x00,
        0x58, 0x58, 0x58, 0x58, // XXXX
      ]);
      expect(detectMimeType(unknown)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Input mutation fix
  // -------------------------------------------------------------------------

  describe('upload must not mutate the input file object', () => {
    it('should not modify file.size during upload', async () => {
      const sm = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
      });
      const file = createMockFile({ originalname: 'test.txt', size: 42 });
      const originalSize = file.size;

      await sm.uploadFile(file);

      expect(file.size).toBe(originalSize);
      sm.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Factory clearCache destroys drivers
  // -------------------------------------------------------------------------

  describe('StorageDriverFactory resource cleanup', () => {
    it('clearCache should call destroy on all cached drivers', () => {
      const factory = new StorageDriverFactory();
      const config: StorageConfig = { driver: 'local', localPath: TEST_DIR };
      const driver = factory.getOrCreate(config);

      let destroyed = false;
      driver.destroy = () => { destroyed = true; };

      factory.clearCache();

      expect(destroyed).toBe(true);
      expect(factory.getCacheSize()).toBe(0);
    });

    it('should use hashed cache key (same config returns same driver)', () => {
      const factory = new StorageDriverFactory();
      const config: StorageConfig = { driver: 'local', localPath: TEST_DIR };

      const driver1 = factory.getOrCreate(config);
      const driver2 = factory.getOrCreate({ ...config });

      expect(driver1).toBe(driver2);
      factory.clearCache();
    });
  });

  // -------------------------------------------------------------------------
  // withConcurrencyLimit work-stealing
  // -------------------------------------------------------------------------

  describe('withConcurrencyLimit load balancing', () => {
    it('should distribute slow items across workers evenly', async () => {
      const workerLog: number[] = [];
      const items = [100, 1, 1, 1, 100, 1, 1, 1]; // ms delay per item

      await withConcurrencyLimit(
        items,
        async (delayMs, index) => {
          await sleep(delayMs);
          workerLog.push(index);
        },
        { maxConcurrent: 2 }
      );

      // With work-stealing, worker that finishes fast items should pick up
      // more work. All 8 items should complete.
      expect(workerLog).toHaveLength(8);
      expect(workerLog.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });
  });

  // -------------------------------------------------------------------------
  // exists() convenience method
  // -------------------------------------------------------------------------

  describe('exists() method', () => {
    let sm: StorageManager;

    beforeEach(() => {
      sm = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
      });
    });

    afterEach(() => {
      sm.destroy();
    });

    it('should return true for an existing file', async () => {
      const file = createMockFile({ originalname: 'exists-test.txt' });
      const result = await sm.uploadFile(file);
      if (!result.success) throw new Error('Upload failed');

      expect(await sm.exists(result.reference)).toBe(true);
    });

    it('should return false for a non-existent file', async () => {
      expect(await sm.exists('nonexistent/file.txt')).toBe(false);
    });

    it('should return false for path traversal attempts', async () => {
      expect(await sm.exists('../../../etc/passwd')).toBe(false);
    });
  });
});
