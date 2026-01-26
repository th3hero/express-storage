/**
 * File Utilities Test Suite
 * 
 * Tests for all utility functions in file.utils.ts
 * Covers: filename generation, sanitization, validation, formatting, retry logic, concurrency
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateUniqueFileName,
  sanitizeFileName,
  validateFileName,
  createMonthBasedPath,
  ensureDirectoryExists,
  formatFileSize,
  validateFileSize,
  validateFileType,
  getFileExtension,
  isImageFile,
  isDocumentFile,
  withRetry,
  sleep,
  withConcurrencyLimit,
} from '../src/utils/file.utils.js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// POSITIVE TEST CASES
// ============================================================================

describe('File Utilities - Positive Tests', () => {
  describe('generateUniqueFileName', () => {
    it('should generate unique filename with timestamp and random suffix', () => {
      const result = generateUniqueFileName('test.jpg');
      
      expect(result).toMatch(/^\d+_[a-f0-9]+_test\.jpg$/);
    });

    it('should preserve file extension', () => {
      const result = generateUniqueFileName('document.pdf');
      
      expect(result.endsWith('.pdf')).toBe(true);
    });

    it('should handle multiple extensions correctly', () => {
      const result = generateUniqueFileName('archive.tar.gz');
      
      expect(result.endsWith('.gz')).toBe(true);
    });

    it('should generate different names for same input', () => {
      const result1 = generateUniqueFileName('test.txt');
      const result2 = generateUniqueFileName('test.txt');
      
      expect(result1).not.toBe(result2);
    });

    it('should handle dotfiles correctly', () => {
      const result = generateUniqueFileName('.gitignore');
      
      // Dotfiles get sanitized - the dot becomes underscore
      expect(result).toMatch(/^\d+_[a-f0-9]+_/);
      expect(result).toContain('gitignore');
    });

    it('should handle .env files', () => {
      const result = generateUniqueFileName('.env');
      
      // Dotfiles get sanitized - the dot becomes underscore
      expect(result).toMatch(/^\d+_[a-f0-9]+_/);
      expect(result).toContain('env');
    });

    it('should handle dotfiles with extensions', () => {
      const result = generateUniqueFileName('.eslintrc.json');
      
      expect(result.endsWith('.json')).toBe(true);
    });

    it('should lowercase extensions', () => {
      const result = generateUniqueFileName('IMAGE.JPG');
      
      expect(result.endsWith('.jpg')).toBe(true);
    });
  });

  describe('sanitizeFileName', () => {
    it('should keep alphanumeric characters', () => {
      expect(sanitizeFileName('test123')).toBe('test123');
    });

    it('should keep dots and hyphens', () => {
      expect(sanitizeFileName('file-name.txt')).toBe('file-name.txt');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizeFileName('my file.txt')).toBe('my_file.txt');
    });

    it('should replace special characters with underscores', () => {
      expect(sanitizeFileName('file@#$%.txt')).toBe('file_.txt');
    });

    it('should collapse multiple underscores', () => {
      expect(sanitizeFileName('file___name.txt')).toBe('file_name.txt');
    });

    it('should trim leading/trailing underscores', () => {
      expect(sanitizeFileName('_file_')).toBe('file');
    });

    it('should handle unicode characters', () => {
      const result = sanitizeFileName('文件名.txt');
      
      expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
    });

    it('should handle emoji filenames', () => {
      const result = sanitizeFileName('📄document.pdf');
      
      expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
    });
  });

  describe('validateFileName', () => {
    it('should accept valid filenames', () => {
      expect(validateFileName('test.txt')).toBeNull();
      expect(validateFileName('my-file.jpg')).toBeNull();
      expect(validateFileName('document_v2.pdf')).toBeNull();
    });

    it('should accept filenames up to 255 characters', () => {
      const longName = 'a'.repeat(255);
      
      expect(validateFileName(longName)).toBeNull();
    });

    it('should accept dotfiles', () => {
      expect(validateFileName('.gitignore')).toBeNull();
      expect(validateFileName('.env')).toBeNull();
    });
  });

  describe('createMonthBasedPath', () => {
    it('should create path with year and month', () => {
      const result = createMonthBasedPath('uploads');
      
      expect(result).toMatch(/^uploads[\\/]\d{4}[\\/]\d{2}$/);
    });

    it('should use UTC date', () => {
      const now = new Date();
      const expectedYear = now.getUTCFullYear().toString();
      const expectedMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
      const result = createMonthBasedPath('base');
      
      expect(result).toContain(expectedYear);
      expect(result).toContain(expectedMonth);
    });
  });

  describe('ensureDirectoryExists', () => {
    const testDir = path.join(process.cwd(), 'test-temp-dir', 'nested', 'path');

    afterEach(() => {
      // Cleanup
      try {
        fs.rmSync(path.join(process.cwd(), 'test-temp-dir'), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should create directory if it does not exist', () => {
      ensureDirectoryExists(testDir);
      
      expect(fs.existsSync(testDir)).toBe(true);
    });

    it('should not throw if directory already exists', () => {
      ensureDirectoryExists(testDir);
      
      expect(() => ensureDirectoryExists(testDir)).not.toThrow();
    });

    it('should create nested directories', () => {
      const deepPath = path.join(testDir, 'deep', 'nested', 'folder');
      ensureDirectoryExists(deepPath);
      
      expect(fs.existsSync(deepPath)).toBe(true);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(500)).toBe('500 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(5.5 * 1024 * 1024)).toBe('5.5 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should format terabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    });

    it('should round to 2 decimal places', () => {
      expect(formatFileSize(1234567)).toBe('1.18 MB');
    });
  });

  describe('validateFileSize', () => {
    it('should return true for files under limit', () => {
      expect(validateFileSize(100, 1000)).toBe(true);
    });

    it('should return true for files at limit', () => {
      expect(validateFileSize(1000, 1000)).toBe(true);
    });
  });

  describe('validateFileType', () => {
    it('should return true for allowed types', () => {
      expect(validateFileType('image/jpeg', ['image/jpeg', 'image/png'])).toBe(true);
    });

    it('should return true when type is in array', () => {
      expect(validateFileType('application/pdf', ['text/plain', 'application/pdf'])).toBe(true);
    });
  });

  describe('getFileExtension', () => {
    it('should return extension with dot', () => {
      expect(getFileExtension('file.txt')).toBe('.txt');
      expect(getFileExtension('image.jpg')).toBe('.jpg');
    });

    it('should return lowercase extension', () => {
      expect(getFileExtension('FILE.TXT')).toBe('.txt');
      expect(getFileExtension('Image.JPG')).toBe('.jpg');
    });

    it('should return last extension for multiple dots', () => {
      expect(getFileExtension('archive.tar.gz')).toBe('.gz');
    });

    it('should return empty string for dotfiles', () => {
      expect(getFileExtension('.gitignore')).toBe('');
      expect(getFileExtension('.env')).toBe('');
    });

    it('should return empty string for no extension', () => {
      expect(getFileExtension('Makefile')).toBe('');
    });
  });

  describe('isImageFile', () => {
    it('should return true for image MIME types', () => {
      expect(isImageFile('image/jpeg')).toBe(true);
      expect(isImageFile('image/png')).toBe(true);
      expect(isImageFile('image/gif')).toBe(true);
      expect(isImageFile('image/webp')).toBe(true);
      expect(isImageFile('image/svg+xml')).toBe(true);
    });
  });

  describe('isDocumentFile', () => {
    it('should return true for document MIME types', () => {
      expect(isDocumentFile('application/pdf')).toBe(true);
      expect(isDocumentFile('application/msword')).toBe(true);
      expect(isDocumentFile('text/plain')).toBe(true);
      expect(isDocumentFile('text/csv')).toBe(true);
    });
  });

  describe('sleep', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      const result = await withRetry(operation, { maxAttempts: 3, baseDelay: 10 });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry multiple times before success', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');
      
      const result = await withRetry(operation, { maxAttempts: 5, baseDelay: 10 });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('withConcurrencyLimit', () => {
    it('should process all items', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await withConcurrencyLimit(
        items,
        async (item) => item * 2,
        { maxConcurrent: 2 }
      );
      
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should maintain order', async () => {
      const items = ['a', 'b', 'c', 'd'];
      const results = await withConcurrencyLimit(
        items,
        async (item, index) => `${item}-${index}`,
        { maxConcurrent: 2 }
      );
      
      expect(results).toEqual(['a-0', 'b-1', 'c-2', 'd-3']);
    });

    it('should return empty array for empty input', async () => {
      const results = await withConcurrencyLimit(
        [],
        async (item: number) => item * 2
      );
      
      expect(results).toEqual([]);
    });

    it('should handle single item', async () => {
      const results = await withConcurrencyLimit(
        [42],
        async (item) => item * 2
      );
      
      expect(results).toEqual([84]);
    });

    it('should limit concurrent executions', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      await withConcurrencyLimit(
        items,
        async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await sleep(50);
          concurrent--;
          return true;
        },
        { maxConcurrent: 3 }
      );
      
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });
});

// ============================================================================
// NEGATIVE TEST CASES
// ============================================================================

describe('File Utilities - Negative Tests', () => {
  describe('validateFileName', () => {
    it('should reject empty filename', () => {
      expect(validateFileName('')).toBe('Filename is required');
    });

    it('should reject whitespace-only filename', () => {
      expect(validateFileName('   ')).toBe('Filename cannot be empty');
    });

    it('should reject null/undefined', () => {
      expect(validateFileName(null as unknown as string)).toBe('Filename is required');
      expect(validateFileName(undefined as unknown as string)).toBe('Filename is required');
    });

    it('should reject filenames over 255 characters', () => {
      const longName = 'a'.repeat(256);
      
      expect(validateFileName(longName)).toBe('Filename is too long (max 255 characters)');
    });

    it('should reject path traversal sequences', () => {
      expect(validateFileName('../file.txt')).toContain('path separators or traversal');
      expect(validateFileName('..\\file.txt')).toContain('path separators or traversal');
      expect(validateFileName('folder/../file.txt')).toContain('path separators or traversal');
    });

    it('should reject absolute paths', () => {
      expect(validateFileName('/etc/passwd')).toContain('path separators');
      expect(validateFileName('C:\\Windows\\System32')).toContain('path separators');
    });

    it('should reject null bytes', () => {
      expect(validateFileName('file\0name.txt')).toContain('null bytes');
    });
  });

  describe('formatFileSize', () => {
    it('should handle NaN', () => {
      expect(formatFileSize(NaN)).toBe('Invalid size');
    });

    it('should handle negative numbers', () => {
      expect(formatFileSize(-100)).toBe('Invalid size (negative)');
    });

    it('should handle Infinity', () => {
      expect(formatFileSize(Infinity)).toBe('Infinite');
    });

    it('should handle negative Infinity', () => {
      expect(formatFileSize(-Infinity)).toBe('Invalid size');
    });

    it('should handle non-number input', () => {
      expect(formatFileSize('not a number' as unknown as number)).toBe('Invalid size');
    });
  });

  describe('validateFileSize', () => {
    it('should return false for files over limit', () => {
      expect(validateFileSize(1001, 1000)).toBe(false);
    });
  });

  describe('validateFileType', () => {
    it('should return false for disallowed types', () => {
      expect(validateFileType('text/html', ['image/jpeg', 'image/png'])).toBe(false);
    });

    it('should return false when not in array', () => {
      expect(validateFileType('application/pdf', [])).toBe(false);
    });
  });

  describe('isImageFile', () => {
    it('should return false for non-image types', () => {
      expect(isImageFile('text/plain')).toBe(false);
      expect(isImageFile('application/pdf')).toBe(false);
      expect(isImageFile('video/mp4')).toBe(false);
    });
  });

  describe('isDocumentFile', () => {
    it('should return false for non-document types', () => {
      expect(isDocumentFile('image/jpeg')).toBe(false);
      expect(isDocumentFile('video/mp4')).toBe(false);
      expect(isDocumentFile('audio/mpeg')).toBe(false);
    });
  });

  describe('getFileExtension', () => {
    it('should return empty string for empty input', () => {
      expect(getFileExtension('')).toBe('');
    });

    it('should return empty string for null/undefined', () => {
      expect(getFileExtension(null as unknown as string)).toBe('');
      expect(getFileExtension(undefined as unknown as string)).toBe('');
    });
  });

  describe('withRetry', () => {
    it('should throw after max attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('always fails'));
      
      await expect(
        withRetry(operation, { maxAttempts: 3, baseDelay: 10 })
      ).rejects.toThrow('always fails');
      
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw last error', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('error1'))
        .mockRejectedValueOnce(new Error('error2'))
        .mockRejectedValueOnce(new Error('error3'));
      
      await expect(
        withRetry(operation, { maxAttempts: 3, baseDelay: 10 })
      ).rejects.toThrow('error3');
    });

    it('should handle non-Error throws', async () => {
      const operation = vi.fn().mockRejectedValue('string error');
      
      await expect(
        withRetry(operation, { maxAttempts: 1 })
      ).rejects.toThrow('string error');
    });
  });

  describe('sanitizeFileName', () => {
    it('should return "file" for empty result', () => {
      expect(sanitizeFileName('###')).toBe('file');
      // Dots are kept in sanitization, so '...' stays as '...'
      expect(sanitizeFileName('$$$')).toBe('file');
    });
  });
});

// ============================================================================
// EDGE CASE / BOUNDARY TESTS
// ============================================================================

describe('File Utilities - Edge Cases', () => {
  describe('generateUniqueFileName', () => {
    it('should handle filename with only extension', () => {
      const result = generateUniqueFileName('.txt');
      
      // .txt is treated as a dotfile, so extension is preserved differently
      expect(result).toMatch(/^\d+_[a-f0-9]+_/);
      expect(result.endsWith('.txt')).toBe(true);
    });

    it('should handle very long filenames', () => {
      const longName = 'a'.repeat(500) + '.txt';
      const result = generateUniqueFileName(longName);
      
      expect(result).toBeDefined();
      expect(result.endsWith('.txt')).toBe(true);
    });
  });

  describe('withRetry - exponential backoff', () => {
    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const startTimes: number[] = [];
      
      const operation = vi.fn().mockImplementation(async () => {
        startTimes.push(Date.now());
        if (startTimes.length < 4) {
          throw new Error('fail');
        }
        return 'success';
      });
      
      await withRetry(operation, {
        maxAttempts: 5,
        baseDelay: 100,
        exponentialBackoff: true,
      });
      
      // Check that delays increase
      for (let i = 1; i < startTimes.length; i++) {
        delays.push(startTimes[i] - startTimes[i - 1]);
      }
      
      // Each delay should be roughly double the previous (with some tolerance)
      expect(delays[1]).toBeGreaterThan(delays[0]);
    });

    it('should respect maxDelay', async () => {
      const startTimes: number[] = [];
      
      const operation = vi.fn().mockImplementation(async () => {
        startTimes.push(Date.now());
        if (startTimes.length < 4) {
          throw new Error('fail');
        }
        return 'success';
      });
      
      await withRetry(operation, {
        maxAttempts: 5,
        baseDelay: 50,
        maxDelay: 100,
        exponentialBackoff: true,
      });
      
      // Check that no delay exceeds maxDelay (with tolerance)
      for (let i = 1; i < startTimes.length; i++) {
        const delay = startTimes[i] - startTimes[i - 1];
        expect(delay).toBeLessThanOrEqual(150); // maxDelay + tolerance
      }
    });

    it('should use constant delay when exponentialBackoff is false', async () => {
      const startTimes: number[] = [];
      
      const operation = vi.fn().mockImplementation(async () => {
        startTimes.push(Date.now());
        if (startTimes.length < 3) {
          throw new Error('fail');
        }
        return 'success';
      });
      
      await withRetry(operation, {
        maxAttempts: 5,
        baseDelay: 50,
        exponentialBackoff: false,
      });
      
      // All delays should be roughly the same
      const delays = [];
      for (let i = 1; i < startTimes.length; i++) {
        delays.push(startTimes[i] - startTimes[i - 1]);
      }
      
      if (delays.length >= 2) {
        const diff = Math.abs(delays[0] - delays[1]);
        expect(diff).toBeLessThan(50); // Should be similar (tolerance for timing)
      }
    });
  });

  describe('withConcurrencyLimit - edge cases', () => {
    it('should handle items less than maxConcurrent', async () => {
      const items = [1, 2];
      const results = await withConcurrencyLimit(
        items,
        async (item) => item * 2,
        { maxConcurrent: 10 }
      );
      
      expect(results).toEqual([2, 4]);
    });

    it('should handle items equal to maxConcurrent', async () => {
      const items = [1, 2, 3];
      const results = await withConcurrencyLimit(
        items,
        async (item) => item * 2,
        { maxConcurrent: 3 }
      );
      
      expect(results).toEqual([2, 4, 6]);
    });

    it('should handle async operations that resolve in different order', async () => {
      const items = [300, 100, 200]; // Delays
      const results = await withConcurrencyLimit(
        items,
        async (delay) => {
          await sleep(delay / 10);
          return delay;
        },
        { maxConcurrent: 3 }
      );
      
      // Results should still be in original order
      expect(results).toEqual([300, 100, 200]);
    });

    it('should use default maxConcurrent of 10', async () => {
      let maxSeen = 0;
      let current = 0;
      
      const items = Array(20).fill(0);
      await withConcurrencyLimit(items, async () => {
        current++;
        maxSeen = Math.max(maxSeen, current);
        await sleep(10);
        current--;
        return true;
      });
      
      expect(maxSeen).toBeLessThanOrEqual(10);
    });
  });

  describe('createMonthBasedPath', () => {
    it('should handle empty base path', () => {
      const result = createMonthBasedPath('');
      
      expect(result).toMatch(/^\d{4}[\\/]\d{2}$/);
    });

    it('should handle base path with trailing slash', () => {
      const result = createMonthBasedPath('uploads/');
      
      expect(result).toMatch(/^uploads[\\/]\d{4}[\\/]\d{2}$/);
    });
  });
});

// ============================================================================
// STRESS / PERFORMANCE TESTS
// ============================================================================

describe('File Utilities - Stress Tests', () => {
  describe('generateUniqueFileName', () => {
    it('should generate 1000 unique names without collision', () => {
      const names = new Set<string>();
      
      for (let i = 0; i < 1000; i++) {
        names.add(generateUniqueFileName('test.txt'));
      }
      
      expect(names.size).toBe(1000);
    });
  });

  describe('withConcurrencyLimit', () => {
    it('should handle large number of items', async () => {
      const items = Array(100).fill(0).map((_, i) => i);
      const results = await withConcurrencyLimit(
        items,
        async (item) => item * 2,
        { maxConcurrent: 10 }
      );
      
      expect(results.length).toBe(100);
      expect(results[0]).toBe(0);
      expect(results[99]).toBe(198);
    });
  });

  describe('sanitizeFileName', () => {
    it('should handle extremely long input', () => {
      const longInput = 'a'.repeat(10000);
      const result = sanitizeFileName(longInput);
      
      expect(result.length).toBeLessThanOrEqual(10000);
    });
  });
});
