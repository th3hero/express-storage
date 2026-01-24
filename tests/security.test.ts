/**
 * Security Test Suite
 * 
 * Comprehensive security tests covering:
 * - Path traversal attacks
 * - Null byte injection
 * - Symlink attacks
 * - File type spoofing
 * - Input validation
 * - Rate limiting abuse
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StorageManager } from '../src/storage-manager.js';
import { StorageDriverFactory } from '../src/factory/driver.factory.js';
import { LocalStorageDriver } from '../src/drivers/local.driver.js';
import {
  validateFileName,
  sanitizeFileName,
  generateUniqueFileName,
} from '../src/utils/file.utils.js';
import {
  createMockFile,
  createMockJpegFile,
  createMockExeFile,
  PATH_TRAVERSAL_CASES,
} from './fixtures/test-helpers.js';

const TEST_DIR = path.join(process.cwd(), 'test-security');
const SENSITIVE_DIR = path.join(process.cwd(), 'test-sensitive');

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

describe('Security Tests', () => {
  beforeEach(() => {
    StorageDriverFactory.clearCache();
    
    // Clean up test directories
    [TEST_DIR, SENSITIVE_DIR].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
    
    // Create test directories
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(SENSITIVE_DIR, { recursive: true });
    
    // Create a sensitive file outside the storage directory
    fs.writeFileSync(path.join(SENSITIVE_DIR, 'secret.txt'), 'TOP SECRET DATA');
  });

  afterEach(() => {
    StorageDriverFactory.clearCache();
    
    [TEST_DIR, SENSITIVE_DIR].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // ============================================================================
  // PATH TRAVERSAL ATTACK TESTS
  // ============================================================================

  describe('Path Traversal Prevention', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
      });
    });

    describe('validateFileName utility', () => {
      const pathTraversalPayloads = [
        '../secret.txt',
        '..\\secret.txt',
        '../../etc/passwd',
        '..\\..\\windows\\system32',
        'folder/../../../etc/passwd',
        'folder/..\\..\\..\\windows',
        '....//....//etc/passwd',
        '...//...//.../etc/passwd',
      ];

      it('should reject all path traversal sequences', () => {
        for (const payload of pathTraversalPayloads) {
          const result = validateFileName(payload);
          expect(result).not.toBeNull();
          expect(result).toContain('path');
        }
      });

      it('should reject forward slash paths', () => {
        expect(validateFileName('/etc/passwd')).toContain('path');
        expect(validateFileName('folder/file.txt')).toContain('path');
      });

      it('should reject backslash paths', () => {
        expect(validateFileName('\\windows\\system32')).toContain('path');
        expect(validateFileName('folder\\file.txt')).toContain('path');
      });
    });

    describe('File deletion path traversal', () => {
      it('should not delete files outside storage directory', async () => {
        const sensitiveFile = path.join(SENSITIVE_DIR, 'secret.txt');
        expect(fs.existsSync(sensitiveFile)).toBe(true);

        // Try various path traversal attacks
        for (const payload of PATH_TRAVERSAL_CASES.slice(0, 8)) {
          const deleted = await storage.deleteFile(payload);
          expect(deleted).toBe(false);
        }

        // Sensitive file should still exist
        expect(fs.existsSync(sensitiveFile)).toBe(true);
      });

      it('should not delete via encoded path traversal', async () => {
        const sensitiveFile = path.join(SENSITIVE_DIR, 'secret.txt');

        // URL encoded path traversal
        const deleted = await storage.deleteFile('%2e%2e%2fsecret.txt');
        expect(deleted).toBe(false);
        expect(fs.existsSync(sensitiveFile)).toBe(true);
      });
    });

    describe('File listing path traversal', () => {
      it('should not list files outside storage directory', async () => {
        for (const payload of PATH_TRAVERSAL_CASES.slice(0, 5)) {
          const result = await storage.listFiles(payload);
          expect(result.success).toBe(false);
        }
      });
    });

    describe('Presigned URL path traversal', () => {
      it('should reject path traversal in filename', async () => {
        for (const payload of PATH_TRAVERSAL_CASES.slice(0, 5)) {
          const result = await storage.generateUploadUrl(payload);
          expect(result.success).toBe(false);
        }
      });

      it('should reject path traversal in folder parameter', async () => {
        const result = await storage.generateUploadUrl(
          'safe.txt',
          'text/plain',
          100,
          '../../../etc'
        );
        expect(result.success).toBe(false);
      });

      it('should reject path traversal in view URL reference', async () => {
        for (const payload of PATH_TRAVERSAL_CASES.slice(0, 5)) {
          const result = await storage.generateViewUrl(payload);
          expect(result.success).toBe(false);
        }
      });
    });

    describe('Upload validation path traversal', () => {
      it('should reject path traversal in validateAndConfirmUpload', async () => {
        for (const payload of PATH_TRAVERSAL_CASES.slice(0, 5)) {
          const result = await storage.validateAndConfirmUpload(payload);
          expect(result.success).toBe(false);
        }
      });
    });
  });

  // ============================================================================
  // NULL BYTE INJECTION TESTS
  // ============================================================================

  describe('Null Byte Injection Prevention', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
      });
    });

    it('should reject null bytes in filename', () => {
      const payloads = [
        'file\0.txt',
        'file\x00.txt',
        'image.jpg\0.txt',
        '\0file.txt',
        'file\0name\0.txt',
      ];

      for (const payload of payloads) {
        const result = validateFileName(payload);
        expect(result).not.toBeNull();
        expect(result).toContain('null');
      }
    });

    it('should reject null bytes in delete reference', async () => {
      const deleted = await storage.deleteFile('file\0.txt');
      expect(deleted).toBe(false);
    });

    it('should reject null bytes in list prefix', async () => {
      const result = await storage.listFiles('folder\0name');
      expect(result.success).toBe(false);
    });

    it('should reject null bytes in presigned URL filename', async () => {
      const result = await storage.generateUploadUrl('file\0name.txt');
      expect(result.success).toBe(false);
    });

    it('should reject null bytes in presigned URL folder', async () => {
      const result = await storage.generateUploadUrl(
        'safe.txt',
        undefined,
        undefined,
        'folder\0name'
      );
      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // SYMLINK ATTACK TESTS
  // ============================================================================

  describe('Symlink Attack Prevention', () => {
    let driver: LocalStorageDriver;

    beforeEach(() => {
      driver = new LocalStorageDriver({
        driver: 'local',
        localPath: TEST_DIR,
      });
    });

    it('should not delete files via symlinks', async () => {
      // Create a real file in sensitive directory
      const targetFile = path.join(SENSITIVE_DIR, 'target.txt');
      fs.writeFileSync(targetFile, 'sensitive data');

      // Create a symlink in the storage directory pointing to the target
      const symlinkPath = path.join(TEST_DIR, 'symlink.txt');
      fs.symlinkSync(targetFile, symlinkPath);

      // Try to delete via symlink
      const deleted = await driver.delete('symlink.txt');

      expect(deleted).toBe(false);
      expect(fs.existsSync(targetFile)).toBe(true);
      expect(fs.existsSync(symlinkPath)).toBe(true);
    });

    it('should not list symlinks', async () => {
      // Create real file
      fs.writeFileSync(path.join(TEST_DIR, 'real.txt'), 'content');

      // Create symlink
      fs.symlinkSync(
        path.join(SENSITIVE_DIR, 'secret.txt'),
        path.join(TEST_DIR, 'link.txt')
      );

      const result = await driver.listFiles();

      expect(result.success).toBe(true);
      expect(result.files?.some(f => f.name === 'real.txt')).toBe(true);
      expect(result.files?.some(f => f.name === 'link.txt')).toBe(false);
    });

    it('should not validate symlinks', async () => {
      // Create symlink
      fs.symlinkSync(
        path.join(SENSITIVE_DIR, 'secret.txt'),
        path.join(TEST_DIR, 'link.txt')
      );

      const result = await driver.validateAndConfirmUpload('link.txt');

      expect(result.success).toBe(false);
    });

    it('should handle symlink to directory', async () => {
      // Create symlink to sensitive directory
      fs.symlinkSync(SENSITIVE_DIR, path.join(TEST_DIR, 'sensitive-link'));

      // Should not be able to list via symlinked directory
      const result = await driver.listFiles('sensitive-link/');

      // Even if listing succeeds, symlink directory should not be traversed
      expect(result.files?.some(f => f.name.includes('secret'))).toBeFalsy();
    });
  });

  // ============================================================================
  // FILE TYPE SPOOFING TESTS
  // ============================================================================

  describe('File Type Spoofing Detection', () => {
    let driver: LocalStorageDriver;

    beforeEach(() => {
      driver = new LocalStorageDriver({
        driver: 'local',
        localPath: TEST_DIR,
      });
    });

    it('should detect executable disguised as image', async () => {
      // Create an EXE file with .jpg extension
      const exeFile = createMockExeFile({ originalname: 'photo.jpg' });

      const uploadResult = await driver.upload(exeFile);
      expect(uploadResult.success).toBe(true);

      // Validation should detect the true file type
      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!);

      expect(validation.success).toBe(true);
      expect(validation.actualContentType).toBe('application/x-msdownload');
    });

    it('should detect JPEG disguised as text file', async () => {
      const jpegFile = createMockJpegFile({ originalname: 'document.txt' });

      const uploadResult = await driver.upload(jpegFile);
      expect(uploadResult.success).toBe(true);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!);

      expect(validation.success).toBe(true);
      expect(validation.actualContentType).toBe('image/jpeg');
    });

    it('should fail validation when expected type does not match', async () => {
      const exeFile = createMockExeFile({ originalname: 'safe.jpg' });

      const uploadResult = await driver.upload(exeFile);
      expect(uploadResult.success).toBe(true);

      const validation = await driver.validateAndConfirmUpload(uploadResult.fileName!, {
        expectedContentType: 'image/jpeg',
      });

      expect(validation.success).toBe(false);
      expect(validation.error).toContain('Content type mismatch');
    });
  });

  // ============================================================================
  // INPUT VALIDATION TESTS
  // ============================================================================

  describe('Input Validation', () => {
    describe('Filename length limits', () => {
      it('should reject filenames over 255 characters', () => {
        const longName = 'a'.repeat(256);
        const result = validateFileName(longName);

        expect(result).not.toBeNull();
        expect(result).toContain('too long');
      });

      it('should accept filenames up to 255 characters', () => {
        const maxName = 'a'.repeat(255);
        const result = validateFileName(maxName);

        expect(result).toBeNull();
      });
    });

    describe('Filename sanitization', () => {
      it('should remove dangerous characters', () => {
        const dangerous = '<script>alert(1)</script>.txt';
        const sanitized = sanitizeFileName(dangerous);

        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('(');
        expect(sanitized).not.toContain(')');
      });

      it('should normalize unicode', () => {
        const unicode = 'café.txt';
        const sanitized = sanitizeFileName(unicode);

        // Should be ASCII-safe
        expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
      });

      it('should handle shell metacharacters', () => {
        const metacharacters = 'file`id`.txt';
        const sanitized = sanitizeFileName(metacharacters);

        expect(sanitized).not.toContain('`');
      });

      it('should handle SQL injection attempts', () => {
        const sqlInjection = "file'; DROP TABLE files;--.txt";
        const sanitized = sanitizeFileName(sqlInjection);

        expect(sanitized).not.toContain("'");
        expect(sanitized).not.toContain(';');
      });
    });

    describe('Content type validation', () => {
      let storage: StorageManager;

      beforeEach(() => {
        storage = new StorageManager({
          driver: 'local',
          credentials: { localPath: TEST_DIR },
        });
      });

      it('should reject invalid MIME type format', async () => {
        const invalidFormats = [
          'invalid',
          'text',
          '/plain',
          'text/',
          'text/plain/extra',
          'text plain',
          '',
        ];

        for (const format of invalidFormats) {
          if (format === '') continue; // Empty is allowed (means any)
          
          const result = await storage.generateUploadUrl('file.txt', format);
          expect(result.success).toBe(false);
        }
      });

      it('should accept valid MIME type formats', async () => {
        const validFormats = [
          'text/plain',
          'image/jpeg',
          'application/octet-stream',
          'application/vnd.ms-excel',
        ];

        for (const format of validFormats) {
          const result = await storage.generateUploadUrl('file.txt', format);
          // Local driver doesn't support presigned URLs, but format validation happens first
          expect(result.error).not.toContain('Invalid contentType');
        }
      });
    });

    describe('File size validation', () => {
      let storage: StorageManager;

      beforeEach(() => {
        storage = new StorageManager({
          driver: 'local',
          credentials: { localPath: TEST_DIR },
        });
      });

      it('should reject negative file size', async () => {
        const result = await storage.generateUploadUrl('file.txt', 'text/plain', -100);

        expect(result.success).toBe(false);
        expect(result.error).toContain('non-negative');
      });

      it('should reject NaN file size', async () => {
        const result = await storage.generateUploadUrl('file.txt', 'text/plain', NaN);

        expect(result.success).toBe(false);
      });

      it('should accept zero file size (for empty files)', async () => {
        const result = await storage.generateUploadUrl('file.txt', 'text/plain', 0);

        // Zero should be accepted (for placeholder files like .gitkeep)
        expect(result.error).not.toContain('non-negative');
      });
    });
  });

  // ============================================================================
  // RATE LIMITING SECURITY TESTS
  // ============================================================================

  describe('Rate Limiting Security', () => {
    it('should prevent URL generation abuse', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
        rateLimit: {
          maxRequests: 5,
          windowMs: 60000,
        },
      });

      // Make requests up to limit
      for (let i = 0; i < 5; i++) {
        await storage.generateUploadUrl(`file${i}.txt`);
      }

      // Subsequent requests should be rate limited
      for (let i = 0; i < 10; i++) {
        const result = await storage.generateUploadUrl(`extra${i}.txt`);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Rate limit');
      }
    });

    it('should rate limit both upload and view URL generation', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
        rateLimit: {
          maxRequests: 3,
          windowMs: 60000,
        },
      });

      // Mix of upload and view requests
      await storage.generateUploadUrl('file1.txt');
      await storage.generateViewUrl('file1.txt');
      await storage.generateUploadUrl('file2.txt');

      // Should be rate limited now
      const result = await storage.generateViewUrl('file3.txt');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should report time until rate limit reset', async () => {
      const storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
        rateLimit: {
          maxRequests: 1,
          windowMs: 60000,
        },
      });

      await storage.generateUploadUrl('file1.txt');

      const status = storage.getRateLimitStatus();

      expect(status).not.toBeNull();
      expect(status!.remainingRequests).toBe(0);
      expect(status!.resetTimeMs).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // FILENAME GENERATION SECURITY
  // ============================================================================

  describe('Secure Filename Generation', () => {
    it('should generate unpredictable filenames', () => {
      const names = new Set<string>();

      for (let i = 0; i < 100; i++) {
        names.add(generateUniqueFileName('test.txt'));
      }

      // All names should be unique
      expect(names.size).toBe(100);
    });

    it('should include cryptographic randomness', () => {
      const name1 = generateUniqueFileName('test.txt');
      const name2 = generateUniqueFileName('test.txt');

      // Extract random portions
      const random1 = name1.split('_')[1];
      const random2 = name2.split('_')[1];

      expect(random1).not.toBe(random2);
      expect(random1.length).toBeGreaterThan(0);
    });

    it('should preserve file extension', () => {
      const name = generateUniqueFileName('document.pdf');

      expect(name.endsWith('.pdf')).toBe(true);
    });

    it('should handle dangerous extensions safely', () => {
      const dangerousFiles = [
        'file.exe',
        'script.bat',
        'command.cmd',
        'shell.sh',
        'config.htaccess',
      ];

      for (const dangerous of dangerousFiles) {
        const name = generateUniqueFileName(dangerous);

        // Extension should be preserved (for server-side validation)
        const ext = path.extname(dangerous);
        expect(name.endsWith(ext)).toBe(true);

        // But path traversal characters should not be present
        expect(name).not.toContain('..');
        expect(name).not.toContain('/');
        expect(name).not.toContain('\\');
      }
    });
  });

  // ============================================================================
  // FOLDER PATH VALIDATION
  // ============================================================================

  describe('Folder Path Security', () => {
    let storage: StorageManager;

    beforeEach(() => {
      storage = new StorageManager({
        driver: 'local',
        credentials: { localPath: TEST_DIR },
      });
    });

    it('should reject shell injection in folder path', async () => {
      const shellPayloads = [
        'folder;rm -rf /',
        'folder`id`',
        "folder'$(whoami)'",
        'folder|cat /etc/passwd',
      ];

      for (const payload of shellPayloads) {
        const result = await storage.generateUploadUrl('file.txt', undefined, undefined, payload);
        expect(result.success).toBe(false);
        expect(result.error).toContain('invalid characters');
      }
    });

    it('should reject double slashes', async () => {
      const result = await storage.generateUploadUrl(
        'file.txt',
        undefined,
        undefined,
        'folder//subfolder'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('consecutive slashes');
    });

    it('should handle leading/trailing slashes gracefully', async () => {
      // These should be normalized, not rejected
      const paths = ['/folder/', '/folder', 'folder/'];

      for (const folderPath of paths) {
        const result = await storage.generateUploadUrl('file.txt', undefined, undefined, folderPath);
        // Should not fail due to slashes (other errors from local driver are OK)
        expect(result.error).not.toContain('invalid characters');
      }
    });
  });
});
