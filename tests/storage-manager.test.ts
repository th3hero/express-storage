import { StorageManager } from '../src/storage-manager';
import { FileUploadResult, PresignedUrlResult } from '../src/types/storage.types';

// Mock Express.Multer.File
const createMockFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
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

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    // Reset environment variables for testing
    process.env.FILE_DRIVER = 'local';
    process.env.LOCAL_PATH = 'test-uploads';
    
    // Clear any cached instances
    StorageManager.clearCache();
  });

  afterEach(() => {
    // Clean up test files
    const fs = require('fs');
    const path = require('path');
    const testDir = path.resolve('test-uploads');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      storageManager = new StorageManager();
      expect(storageManager).toBeInstanceOf(StorageManager);
      expect(storageManager.getDriverType()).toBe('local');
    });

    it('should initialize with custom configuration', () => {
      storageManager = StorageManager.initialize({
        driver: 'local',
        localPath: 'custom-uploads',
      });
      
      expect(storageManager).toBeInstanceOf(StorageManager);
      expect(storageManager.getDriverType()).toBe('local');
    });

    it('should throw error for invalid driver', () => {
      expect(() => {
        StorageManager.initialize({
          driver: 'invalid-driver' as any,
        });
      }).toThrow('Configuration validation failed');
    });
  });

  describe('File Upload', () => {
    beforeEach(() => {
      storageManager = new StorageManager();
    });

    it('should upload single file successfully', async () => {
      const mockFile = createMockFile();
      const result = await storageManager.uploadFile(mockFile);

      expect(result.success).toBe(true);
      expect(result.fileName).toBeDefined();
      expect(result.fileUrl).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should upload multiple files successfully', async () => {
      const mockFiles = [
        createMockFile({ originalname: 'file1.jpg' }),
        createMockFile({ originalname: 'file2.png' }),
      ];

      const results = await storageManager.uploadFiles(mockFiles);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle file validation errors', async () => {
      const invalidFile = createMockFile({
        buffer: Buffer.alloc(0), // Empty buffer
      });

      const result = await storageManager.uploadFile(invalidFile);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle upload with input type detection', async () => {
      const mockFile = createMockFile();
      
      // Single file input
      const singleResult = await storageManager.upload({
        type: 'single',
        file: mockFile,
      }) as FileUploadResult;

      expect(singleResult.success).toBe(true);

      // Multiple files input
      const mockFiles = [createMockFile(), createMockFile()];
      const multipleResults = await storageManager.upload({
        type: 'multiple',
        files: mockFiles,
      }) as FileUploadResult[];

      expect(multipleResults).toHaveLength(2);
      expect(multipleResults[0].success).toBe(true);
    });
  });

  describe('File Deletion', () => {
    beforeEach(() => {
      storageManager = new StorageManager();
    });

    it('should delete single file successfully', async () => {
      // First upload a file
      const mockFile = createMockFile();
      const uploadResult = await storageManager.uploadFile(mockFile);
      
      if (uploadResult.success && uploadResult.fileName) {
        const deleteResult = await storageManager.deleteFile(uploadResult.fileName);
        expect(deleteResult).toBe(true);
      }
    });

    it('should delete multiple files successfully', async () => {
      // Upload multiple files
      const mockFiles = [
        createMockFile({ originalname: 'file1.jpg' }),
        createMockFile({ originalname: 'file2.png' }),
      ];

      const uploadResults = await storageManager.uploadFiles(mockFiles);
      const fileNames = uploadResults
        .filter(r => r.success && r.fileName)
        .map(r => r.fileName!);

      if (fileNames.length > 0) {
        const deleteResults = await storageManager.deleteFiles(fileNames);
        expect(deleteResults.every(result => result === true)).toBe(true);
      }
    });
  });

  describe('Configuration', () => {
    it('should return current configuration', () => {
      storageManager = new StorageManager();
      const config = storageManager.getConfig();

      expect(config).toHaveProperty('driver');
      expect(config).toHaveProperty('localPath');
      expect(config).toHaveProperty('presignedUrlExpiry');
    });

    it('should return driver type', () => {
      storageManager = new StorageManager();
      const driverType = storageManager.getDriverType();

      expect(driverType).toBe('local');
    });

    it('should check presigned support', () => {
      storageManager = new StorageManager();
      const isPresignedSupported = storageManager.isPresignedSupported();

      expect(isPresignedSupported).toBe(false);
    });
  });

  describe('Static Methods', () => {
    it('should return available drivers', () => {
      const drivers = StorageManager.getAvailableDrivers();

      expect(drivers).toContain('local');
      expect(drivers).toContain('s3');
      expect(drivers).toContain('s3-presigned');
      expect(drivers).toContain('gcs');
      expect(drivers).toContain('gcs-presigned');
      expect(drivers).toContain('oci');
      expect(drivers).toContain('oci-presigned');
    });

    it('should clear cache', () => {
      StorageManager.clearCache();
      // Should not throw any error
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', () => {
      // Set invalid environment variable
      process.env.FILE_DRIVER = 'invalid';
      
      expect(() => {
        new StorageManager();
      }).toThrow();
    });

    it('should handle upload errors gracefully', async () => {
      storageManager = new StorageManager();
      
      // Try to upload null file
      const result = await storageManager.uploadFile(null as any);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
}); 