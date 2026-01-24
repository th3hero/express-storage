/**
 * Test Helpers and Mock Factories
 * 
 * Provides utilities for creating mock files, buffers, and test data.
 */

import { Readable } from 'stream';

/**
 * Creates a mock Multer file object for testing
 */
export function createMockFile(options: {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
  path?: string;
  fieldname?: string;
  encoding?: string;
  destination?: string;
  filename?: string;
  stream?: Readable;
} = {}): Express.Multer.File {
  const defaultBuffer = Buffer.from('test file content');
  
  return {
    fieldname: options.fieldname || 'file',
    originalname: options.originalname || 'test-file.txt',
    encoding: options.encoding || '7bit',
    mimetype: options.mimetype || 'text/plain',
    size: options.size ?? options.buffer?.length ?? defaultBuffer.length,
    buffer: options.buffer ?? defaultBuffer,
    destination: options.destination || '',
    filename: options.filename || '',
    path: options.path || '',
    stream: options.stream || Readable.from(options.buffer ?? defaultBuffer),
  };
}

/**
 * Creates a mock image file with actual JPEG magic bytes
 */
export function createMockJpegFile(options: {
  originalname?: string;
  size?: number;
} = {}): Express.Multer.File {
  // JPEG magic bytes (FF D8 FF) followed by some data
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  const padding = Buffer.alloc(Math.max(0, (options.size || 100) - jpegHeader.length));
  const buffer = Buffer.concat([jpegHeader, padding]);
  
  return createMockFile({
    originalname: options.originalname || 'test-image.jpg',
    mimetype: 'image/jpeg',
    buffer,
    size: buffer.length,
  });
}

/**
 * Creates a mock PNG file with actual PNG magic bytes
 */
export function createMockPngFile(options: {
  originalname?: string;
  size?: number;
} = {}): Express.Multer.File {
  // PNG magic bytes
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const padding = Buffer.alloc(Math.max(0, (options.size || 100) - pngHeader.length));
  const buffer = Buffer.concat([pngHeader, padding]);
  
  return createMockFile({
    originalname: options.originalname || 'test-image.png',
    mimetype: 'image/png',
    buffer,
    size: buffer.length,
  });
}

/**
 * Creates a mock PDF file with actual PDF magic bytes
 */
export function createMockPdfFile(options: {
  originalname?: string;
  size?: number;
} = {}): Express.Multer.File {
  // PDF magic bytes (%PDF)
  const pdfHeader = Buffer.from('%PDF-1.4');
  const padding = Buffer.alloc(Math.max(0, (options.size || 100) - pdfHeader.length));
  const buffer = Buffer.concat([pdfHeader, padding]);
  
  return createMockFile({
    originalname: options.originalname || 'test-document.pdf',
    mimetype: 'application/pdf',
    buffer,
    size: buffer.length,
  });
}

/**
 * Creates a mock executable file (for security testing)
 */
export function createMockExeFile(options: {
  originalname?: string;
  size?: number;
} = {}): Express.Multer.File {
  // Windows EXE magic bytes (MZ)
  const exeHeader = Buffer.from([0x4D, 0x5A, 0x90, 0x00]);
  const padding = Buffer.alloc(Math.max(0, (options.size || 100) - exeHeader.length));
  const buffer = Buffer.concat([exeHeader, padding]);
  
  return createMockFile({
    originalname: options.originalname || 'malware.exe',
    mimetype: 'application/x-msdownload',
    buffer,
    size: buffer.length,
  });
}

/**
 * Creates a large mock file for streaming tests
 */
export function createLargeMockFile(sizeInMB: number = 150): Express.Multer.File {
  const size = sizeInMB * 1024 * 1024;
  // Don't actually allocate the full buffer, just set the size
  const buffer = Buffer.alloc(1024); // Small buffer
  
  return createMockFile({
    originalname: 'large-file.bin',
    mimetype: 'application/octet-stream',
    buffer,
    size, // Report larger size
  });
}

/**
 * Creates a mock file with empty buffer
 */
export function createEmptyMockFile(originalname: string = 'empty.txt'): Express.Multer.File {
  return createMockFile({
    originalname,
    mimetype: 'text/plain',
    buffer: Buffer.alloc(0),
    size: 0,
  });
}

/**
 * Creates a mock file without buffer (simulates disk storage)
 */
export function createDiskStorageMockFile(options: {
  originalname?: string;
  mimetype?: string;
  path: string;
  size?: number;
}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: options.originalname || 'disk-file.txt',
    encoding: '7bit',
    mimetype: options.mimetype || 'text/plain',
    size: options.size || 0,
    buffer: undefined as unknown as Buffer,
    destination: '',
    filename: '',
    path: options.path,
    stream: undefined as unknown as Readable,
  };
}

/**
 * Generates random string of specified length
 */
export function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates test environment variables
 */
export function createTestEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    FILE_DRIVER: 'local',
    LOCAL_PATH: 'test-uploads',
    ...overrides,
  };
}

/**
 * Sets up environment variables for testing and returns cleanup function
 */
export function setupTestEnv(env: Record<string, string>): () => void {
  const originalEnv: Record<string, string | undefined> = {};
  
  // Save original values and set new ones
  for (const [key, value] of Object.entries(env)) {
    originalEnv[key] = process.env[key];
    process.env[key] = value;
  }
  
  // Return cleanup function
  return () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

/**
 * Path traversal test cases
 */
export const PATH_TRAVERSAL_CASES = [
  '../secret.txt',
  '..\\secret.txt',
  '../../etc/passwd',
  '..\\..\\windows\\system32',
  'folder/../../../etc/passwd',
  'folder/..\\..\\..\\windows',
  'file\x00.txt',
  'folder/file\x00.txt',
  '....//....//etc/passwd',
  '%2e%2e%2f%2e%2e%2fetc/passwd',
  '..%252f..%252f..%252fetc/passwd',
];

/**
 * Invalid filename test cases
 */
export const INVALID_FILENAME_CASES = [
  '',
  '   ',
  '\t\n',
  '../file.txt',
  'a'.repeat(256), // Too long
  'file\0name.txt', // Null byte
  '/absolute/path.txt',
  '\\windows\\path.txt',
];

/**
 * Valid filename test cases
 */
export const VALID_FILENAME_CASES = [
  'file.txt',
  'my-file.jpg',
  'document_v2.pdf',
  'image.PNG',
  '.gitignore',
  '.env',
  'file-with-many-dots.test.spec.ts',
  '日本語ファイル.txt', // Unicode (will be sanitized)
  'file (1).txt',
  'a'.repeat(255), // Max length
];

/**
 * MIME type test cases
 */
export const MIME_TYPE_CASES = {
  valid: [
    'text/plain',
    'image/jpeg',
    'image/png',
    'application/json',
    'application/octet-stream',
    'video/mp4',
    'audio/mpeg',
    'application/vnd.ms-excel',
  ],
  invalid: [
    '',
    'invalid',
    'text',
    '/plain',
    'text/',
    'text/plain/extra',
    'text plain',
  ],
};
