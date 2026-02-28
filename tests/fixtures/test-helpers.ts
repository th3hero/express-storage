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

