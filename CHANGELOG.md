# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-02-28

### Breaking Changes

- **Cloud SDKs are now optional peer dependencies.** Consumers must install the SDK for their chosen provider. This eliminates dependency bloat — local-storage-only users no longer download AWS, GCS, and Azure SDKs. See the [migration guide](README.md#migrating-from-v2-to-v3) for details.

  ```bash
  # Install only what you need
  npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner  # S3
  npm install @google-cloud/storage                                                    # GCS
  npm install @azure/storage-blob @azure/identity                                      # Azure
  ```

- **Result types are now discriminated unions.** `FileUploadResult`, `DeleteResult`, `PresignedUrlResult`, `BlobValidationResult`, and `ListFilesResult` use `success: true | false` as a discriminant. TypeScript now narrows correctly: `result.fileName` is guaranteed to exist when `result.success` is `true`, and `result.error` is guaranteed on `false`. If your code accessed `.error` or `.fileName` without checking `.success`, TypeScript may now flag it — add the check.

- **Presigned driver subclasses removed from exports.** `S3PresignedStorageDriver`, `GCSPresignedStorageDriver`, and `AzurePresignedStorageDriver` are no longer exported. The base driver classes (`S3StorageDriver`, `GCSStorageDriver`, `AzureStorageDriver`) now handle both direct and presigned modes internally based on the `driver` config string. The `StorageManager` API is unchanged — `driver: 's3-presigned'` still works.

- **`StorageOptions.rateLimit` renamed to `rateLimiter`.** Accepts either `RateLimitOptions` (for the built-in in-memory limiter) or a custom `RateLimiterAdapter` implementation.

- **`getRateLimitStatus()` is now async.** Returns `Promise<{ remainingRequests: number; resetTimeMs: number } | null>` to support async rate limiter adapters (e.g., Redis).

- **`deleteFile()` now returns `DeleteResult` instead of `boolean`.** Provides error details and error codes on failure, consistent with every other operation. Migration: change `if (await storage.deleteFile(ref))` to `if ((await storage.deleteFile(ref)).success)`.

- **`IStorageDriver.delete()` now returns `DeleteResult` instead of `boolean`.** Custom driver implementations must be updated.

- **`ensureDirectoryExists()` is now async.** Returns `Promise<void>` — add `await` to existing calls.

- **Presigned URL methods return stricter types.** `generateUploadUrl()` returns `PresignedUploadUrlResult` with guaranteed `uploadUrl`, `fileName`, `reference`, `expiresIn` on success. `generateViewUrl()` returns `PresignedViewUrlResult` with guaranteed `viewUrl`, `reference`, `expiresIn` on success.

- **`FileUploadSuccess.fileName` renamed to `FileUploadSuccess.reference`.** The field always contained a stored file path (e.g., `2026/02/timestamp_photo.jpg`), not just a filename. `reference` is now used consistently across `FileUploadResult`, `DeleteResult`, and presigned URL results as the identifier for subsequent operations (`deleteFile()`, `getMetadata()`, `generateViewUrl()`).

- **`DeleteSuccess.fileName` and `DeleteError.fileName` renamed to `.reference`.** Same rationale — consistent naming with the rest of the API.

- **Utility functions, driver classes, and config helpers moved to subpath exports.** `import { withRetry } from 'express-storage'` → `import { withRetry } from 'express-storage/utils'`. Driver classes: `import { BaseStorageDriver } from 'express-storage/drivers'`. Config: `import { validateStorageConfig } from 'express-storage/config'`. Types remain at the top level (`import type { FileUploadResult } from 'express-storage'`).

- **Error codes on all error results.** Every error result now includes a `code` field (`StorageErrorCode`) for programmatic error handling. See [Error Codes](#error-codes).

### Added

- **`getMetadata(reference)`** — returns file metadata (name, size, contentType, lastModified) without downloading the file. Works with all drivers.
- **`destroy()`** — releases resources held by a StorageManager instance (clears factory cache entry and rate limiter).
- **`AbortSignal` support on batch methods.** `uploadFiles`, `deleteFiles`, `generateUploadUrls`, and `generateViewUrls` accept a `{ signal }` option to cancel long-running batches mid-flight.
- **Lifecycle hooks.** `StorageOptions.hooks` lets you tap into upload/delete lifecycle events (`beforeUpload`, `afterUpload`, `beforeDelete`, `afterDelete`, `onError`) without modifying drivers. Before-hooks can throw to abort the operation.
- **Pluggable rate limiter.** `RateLimiterAdapter` interface allows custom rate limiting implementations (Redis, Memcached, etc.). The built-in `InMemoryRateLimiter` is now exported separately.
- **Configurable concurrency.** `StorageOptions.concurrency` controls the parallelism limit for batch operations (`uploadFiles`, `deleteFiles`, `generateUploadUrls`, `generateViewUrls`). Default: 10.
- **Error codes.** `StorageErrorCode` type with codes like `FILE_TOO_LARGE`, `INVALID_MIME_TYPE`, `PATH_TRAVERSAL`, `RATE_LIMITED`, etc. for programmatic error branching.
- **Local driver metadata sidecar.** When `UploadOptions.metadata` is provided, the local driver stores it as a `.meta.json` file alongside the uploaded file.
- **`hasPathTraversal(value)`** and **`encodePathSegments(path)`** exported from `express-storage/utils`.
- **Tiered export strategy.** The top-level `express-storage` export now contains only `StorageManager`, `InMemoryRateLimiter`, and types. Driver classes, utility functions, and config helpers are available via subpath imports:
  - `express-storage/drivers` — `BaseStorageDriver`, driver classes, `StorageDriverFactory`, `createDriver`
  - `express-storage/utils` — `withRetry`, `formatFileSize`, `withConcurrencyLimit`, file helpers
  - `express-storage/config` — `validateStorageConfig`, `loadAndValidateConfig`, env utilities
- `isolatedModules: true` in tsconfig for esbuild/SWC/Babel compatibility.
- `minimatch` override to resolve ReDoS vulnerability (GHSA-3ppc-4f35-3m26) in ESLint dependency tree.

### Changed

- Cloud SDK modules are loaded lazily via dynamic `import()` on first use, not at import time. If a required SDK is not installed, the error message includes the exact install command.
- Extracted shared validation logic (`validateAndConfirmUpload`) into `BaseStorageDriver`, eliminating ~120 lines of duplicated code across S3, GCS, and Azure drivers.
- Consolidated duplicated path traversal checks into `decodeAndValidateFileName()` and `decodeAndValidateFileNameOrNull()` in `BaseStorageDriver`.
- Consolidated duplicated `maxResults` validation into `validateMaxResults()` in `BaseStorageDriver`.
- Consolidated identical presigned upload logic into `presignedUpload()` in `BaseStorageDriver`.
- Presigned mode is now a flag on the base driver class instead of separate subclasses. The factory maps `'s3-presigned'` → `S3StorageDriver` (with `presignedMode: true`), etc.
- Driver factory cache key uses SHA-256 instead of triple FNV-1a hash — simpler, more collision-resistant, and credentials never appear as plaintext in the key.
- Driver constructors validate required fields at construction time instead of using non-null assertions.
- **All filesystem operations are now async** — `validateFile()`, `getFileContent()`, `getFileSize()`, `cleanupTempFile()`, `ensureDirectoryExists()`, and all local driver methods use `fs/promises`. Zero event-loop blocking under concurrent load.
- Local driver's `listFiles()` uses `readdir({ withFileTypes: true })` to reduce syscalls.
- Local driver's `detectMimeTypeFromMagicBytes()` is now async.
- `InMemoryRateLimiter` rewritten with O(1) sliding window counter algorithm (replaces O(n) array + filter).
- `StorageManager` upload/delete orchestration extracted into shared `executeSingleUpload()` / `executeSingleDelete()` helpers — eliminates duplication between single and batch methods.
- `moduleResolution` changed from `"node"` to `"bundler"` in tsconfig for proper `.js` extension resolution.
- Added `sideEffects: false` to package.json for bundler tree-shaking.
- TypeScript target upgraded from ES2020 to ES2022 (matches Node 18+ engine requirement).
- Fixed `package.json` `exports` field to use nested conditional exports — CJS TypeScript consumers now get CJS type declarations instead of ESM types.
- Fixed `types` field to point to CJS declarations (matches `main` entry point for legacy `moduleResolution: "node"` consumers).
- Source files (`src/`) are now included in the published package, making `.d.ts.map` and `.js.map` source maps functional for IDE "Go to Source" navigation.

### Removed

- `S3PresignedStorageDriver`, `GCSPresignedStorageDriver`, `AzurePresignedStorageDriver` class exports (presigned mode is now handled by the base driver classes).
- `tslib` removed from dependencies (was unused — `importHelpers` was never enabled).
- Removed dead tsconfig flags: `experimentalDecorators`, `emitDecoratorMetadata`, `allowSyntheticDefaultImports`.
- Removed dead code: `getBucketPath()`, `formatBytes()` wrapper, `hasAccountKey()`, redundant presigned driver constructors.
- Removed deprecated `upload()` generic method and `FileInput` / `SingleFileInput` / `MultipleFilesInput` types.
- Removed `ts-node` configuration block from `tsconfig.json`.
- Removed stale `fast-xml-parser` override (resolved versions already above minimum).

## [2.0.2] - Previous Release

- Initial public release with support for local, S3, GCS, and Azure storage drivers.
- Presigned URL support with per-provider constraint enforcement.
- File validation, path traversal prevention, and automatic filename sanitization.
- Rate limiting for presigned URL generation.
- Streaming uploads for files larger than 100MB.
