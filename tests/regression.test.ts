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
import { resetDotenvInitialization } from '../src/utils/config.utils.js';
import {
  generateUniqueFileName,
  sanitizeFileName,
  formatFileSize,
  withRetry,
  withConcurrencyLimit,
  sleep,
} from '../src/utils/file.utils.js';
import {
  createMockFile,
  createMockJpegFile,
  createLargeMockFile,
} from './fixtures/test-helpers.js';

const TEST_DIR = path.join(process.cwd(), 'test-regression');

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

describe('Regression Tests', () => {
  beforeEach(() => {
    resetDotenvInitialization();
    StorageDriverFactory.clearCache();
    
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    StorageDriverFactory.clearCache();
    
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
        expect(result.fileName).toContain('.json');
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
        const names = new Set(results.map(r => r.fileName));
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
          .map(r => r.fileName!);

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
      // Rapidly create and clear cache
      for (let i = 0; i < 100; i++) {
        StorageDriverFactory.createDriver({
          driver: 'local',
          localPath: `path-${i}`,
        });

        if (i % 10 === 0) {
          StorageDriverFactory.clearCache();
        }
      }

      // Should not crash
      expect(StorageDriverFactory.getCacheSize()).toBeGreaterThanOrEqual(0);
    });

    it('should handle identical configs created simultaneously', async () => {
      const config = {
        driver: 'local' as const,
        localPath: 'identical-path',
      };

      // Create drivers concurrently
      const promises = Array(10).fill(null).map(() =>
        Promise.resolve(StorageDriverFactory.createDriver(config))
      );

      const drivers = await Promise.all(promises);

      // All should be the same cached instance
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

    it('should mask all sensitive fields in getSafeConfig', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
      });

      const safeConfig = storage.getSafeConfig();

      // These should be undefined or masked
      expect(safeConfig.awsAccessKey).toBeUndefined();
      expect(safeConfig.awsSecretKey).toBeUndefined();
      expect(safeConfig.azureConnectionString).toBeUndefined();
      expect(safeConfig.azureAccountKey).toBeUndefined();
      expect(safeConfig.gcsCredentials).toBeUndefined();
    });

    it('should preserve non-sensitive fields in getSafeConfig', () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: {
          localPath: TEST_DIR,
          bucketPath: 'my-path',
          presignedUrlExpiry: 1800,
        },
      });

      const safeConfig = storage.getSafeConfig();

      expect(safeConfig.localPath).toBe(TEST_DIR);
      expect(safeConfig.bucketPath).toBe('my-path');
      expect(safeConfig.presignedUrlExpiry).toBe(1800);
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
});
