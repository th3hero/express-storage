import { LocalStorageDriver } from '../src/drivers/local.driver';
import fs from 'fs';
import path from 'path';

// Mock Express.Multer.File
const createMockFile = (overrides = {}): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'test.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  size: 1024,
  buffer: Buffer.from('test file content'),
  stream: {} as any,
  destination: '',
  filename: 'test.jpg',
  path: '',
  ...overrides,
});

describe('LocalStorageDriver', () => {
  let driver: LocalStorageDriver;
  const testConfig = {
    driver: 'local' as const,
    localPath: 'test-uploads',
    presignedUrlExpiry: 600,
  };

  beforeEach(() => {
    driver = new LocalStorageDriver(testConfig);
  });

  afterEach(() => {
    // Clean up test files
    const testDir = path.resolve('test-uploads');
    if (fs.existsSync(testDir)) {
      // Use a more robust cleanup that handles non-empty directories
      const rimraf = (dir: string) => {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              rimraf(filePath);
            } else {
              fs.unlinkSync(filePath);
            }
          }
          try {
            fs.rmdirSync(dir);
          } catch (error) {
            // Directory might already be removed or not empty, ignore
          }
        }
      };
      rimraf(testDir);
    }
  });

  describe('File Upload', () => {
    it('should upload file successfully', async () => {
      const mockFile = createMockFile();
      const result = await driver.upload(mockFile);

      expect(result.success).toBe(true);
      expect(result.fileName).toBeDefined();
      expect(result.fileUrl).toBeDefined();
      expect(result.error).toBeUndefined();

      // Check if file was actually created in month/year directory
      const fileName = result.fileName!;
      const currentDate = new Date();
      const month = currentDate.toLocaleString('en', { month: 'long' }).toLowerCase();
      const year = currentDate.getFullYear();
      const filePath = path.join('test-uploads', month, year.toString(), fileName);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should generate unique filenames', async () => {
      const mockFile1 = createMockFile({ originalname: 'test1.jpg' });
      const mockFile2 = createMockFile({ originalname: 'test2.jpg' });

      const result1 = await driver.upload(mockFile1);
      const result2 = await driver.upload(mockFile2);

      expect(result1.fileName).not.toBe(result2.fileName);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should handle file validation errors', async () => {
      const invalidFile = createMockFile({
        buffer: Buffer.alloc(0), // Empty buffer
      });

      const result = await driver.upload(invalidFile);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should create directory if it does not exist', async () => {
      const mockFile = createMockFile();
      await driver.upload(mockFile);

      // Check if directory was created (should be in month/year subdirectory)
      const currentDate = new Date();
      const month = currentDate.toLocaleString('en', { month: 'long' }).toLowerCase();
      const year = currentDate.getFullYear();
      const expectedDir = path.join('test-uploads', month, year.toString());
      expect(fs.existsSync(expectedDir)).toBe(true);
    });
  });

  describe('File Deletion', () => {
    it('should delete file successfully', async () => {
      // First upload a file
      const mockFile = createMockFile();
      const uploadResult = await driver.upload(mockFile);

      if (uploadResult.success && uploadResult.fileName) {
        const deleteResult = await driver.delete(uploadResult.fileName);
        expect(deleteResult).toBe(true);

        // Check if file was actually deleted (should be in month/year subdirectory)
        const currentDate = new Date();
        const month = currentDate.toLocaleString('en', { month: 'long' }).toLowerCase();
        const year = currentDate.getFullYear();
        const filePath = path.join('test-uploads', month, year.toString(), uploadResult.fileName);
        expect(fs.existsSync(filePath)).toBe(false);
      }
    });

    it('should return false for non-existent file', async () => {
      const deleteResult = await driver.delete('non-existent-file.jpg');
      expect(deleteResult).toBe(false);
    });
  });

  describe('Presigned URLs', () => {
    it('should return error for presigned upload URL', async () => {
      const result = await driver.generateUploadUrl('test.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Presigned URLs are not supported for local storage');
    });

    it('should return error for presigned view URL', async () => {
      const result = await driver.generateViewUrl('test.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Presigned URLs are not supported for local storage');
    });
  });

  describe('Multiple File Operations', () => {
    it('should upload multiple files successfully', async () => {
      const mockFiles = [
        createMockFile({ originalname: 'file1.jpg' }),
        createMockFile({ originalname: 'file2.png' }),
      ];

      const results = await driver.uploadMultiple(mockFiles);

      expect(results).toHaveLength(2);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(true);
    });

    it('should delete multiple files successfully', async () => {
      // Upload multiple files
      const mockFiles = [
        createMockFile({ originalname: 'file1.jpg' }),
        createMockFile({ originalname: 'file2.png' }),
      ];

      const uploadResults = await driver.uploadMultiple(mockFiles);
      const fileNames = uploadResults
        .filter(r => r.success && r.fileName)
        .map(r => r.fileName!);

      if (fileNames.length > 0) {
        const deleteResults = await driver.deleteMultiple(fileNames);
        expect(deleteResults.every(result => result === true)).toBe(true);
      }
    });
  });

  describe('File Organization', () => {
    it('should organize files by month and year', async () => {
      const mockFile = createMockFile();
      const result = await driver.upload(mockFile);

      if (result.success && result.fileName) {
        // Check if file is in month/year directory
        const currentDate = new Date();
        const month = currentDate.toLocaleString('en', { month: 'long' }).toLowerCase();
        const year = currentDate.getFullYear();
        const expectedDir = path.join('test-uploads', month, year.toString());
        
        expect(fs.existsSync(expectedDir)).toBe(true);
      }
    });
  });

  describe('Filename Generation', () => {
    it('should generate filenames with unix timestamp', async () => {
      const mockFile = createMockFile({ originalname: 'test-file.jpg' });
      const result = await driver.upload(mockFile);

      if (result.success && result.fileName) {
        // Check if filename contains timestamp
        expect(result.fileName).toMatch(/^\d+_test-file\.jpg$/);
      }
    });

    it('should sanitize filenames', async () => {
      const mockFile = createMockFile({ originalname: 'test file with spaces.jpg' });
      const result = await driver.upload(mockFile);

      if (result.success && result.fileName) {
        // Check if spaces are replaced with underscores
        expect(result.fileName).toMatch(/^\d+_test_file_with_spaces\.jpg$/);
      }
    });
  });
}); 