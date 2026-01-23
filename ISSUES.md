# Express Storage - Known Issues & Bugs

This document tracks identified bugs and issues in the codebase that need to be addressed.

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 2 | ✅ Resolved |
| High | 10 | 🔴 2 Open |
| Medium | 12 | 🔴 3 Open |
| Low | 17 | 🔴 5 Open |
| **Total** | **41** | **31 Resolved, 10 Open** |

---

## Open Issues (32-41) - January 2026

### 32. ❌ README Documentation Uses Wrong Parameter Name (LOW)

**File:** `README.md` (line 296)

**Problem:**
The retry utility example uses `maxRetries` but the actual code uses `maxAttempts`:

```typescript
// README shows:
{ maxRetries: 3 }

// Code expects:
{ maxAttempts: 3 }
```

**Impact:** Users copying the example will get unexpected behavior (parameter ignored).

**Fix:** Update README line 296 from `maxRetries` to `maxAttempts`.

---

### 33. ❌ isPresignedSupported() Method Name Misleading (LOW)

**File:** `src/storage-manager.ts` (line 589-591)

**Problem:**
```typescript
isPresignedSupported(): boolean {
  return this.config.driver.includes('-presigned');
}
```

The method checks if the driver *mode* is presigned, but ALL cloud drivers can generate presigned URLs. The direct upload drivers (`s3`, `gcs`, `azure`) can also call `generateUploadUrl()`.

**Impact:** Confusing API - users may think they can't generate presigned URLs with `s3` driver.

**Fix:** Either:
1. Rename to `isPresignedUploadMode()` 
2. Or document that this indicates upload behavior, not capability

---

### 34. ❌ Local Driver validateAndConfirmUpload Always Fails (MEDIUM)

**File:** `src/drivers/local.driver.ts`

**Problem:**
`LocalStorageDriver` doesn't override `validateAndConfirmUpload()`. The base class implementation calls `generateViewUrl()` which returns an error for local storage ("Presigned URLs are not supported for local storage").

```typescript
// base.driver.ts line 230
const viewResult = await this.generateViewUrl(reference);
// For local, this always returns success: false
```

**Impact:** Calling `validateAndConfirmUpload()` on local storage always fails, even though the file exists.

**Fix:** Override `validateAndConfirmUpload()` in `LocalStorageDriver` to check file existence directly using `fs.existsSync()`.

---

### 35. ❌ parseInt Without NaN Validation (HIGH)

**Files:** 
- `src/storage-manager.ts` (lines 88, 90)
- `src/utils/config.utils.ts` (lines 92, 95)

**Problem:**
Environment variables parsed with `parseInt()` without checking for `NaN`:

```typescript
// If PRESIGNED_URL_EXPIRY=abc
presignedUrlExpiry: parseInt(process.env['PRESIGNED_URL_EXPIRY'], 10)
// Result: NaN
```

**Impact:** Invalid env values result in `NaN` being used, causing silent failures or unexpected behavior.

**Fix:** Add NaN checks or use a safer parsing function:
```typescript
const value = parseInt(envConfig.PRESIGNED_URL_EXPIRY, 10);
presignedUrlExpiry: Number.isNaN(value) ? DEFAULT_CONFIG.presignedUrlExpiry : value;
```

---

### 36. ❌ Driver Cache Key Missing Important Config (HIGH)

**File:** `src/factory/driver.factory.ts` (line 61)

**Problem:**
```typescript
private static getDriverKey(config: StorageConfig): string {
  return `${config.driver}_${config.bucketName || 'local'}_${config.localPath || 'default'}`;
}
```

The cache key doesn't include:
- `presignedUrlExpiry`
- `maxFileSize`
- `bucketPath`
- AWS credentials
- Azure/GCS credentials

**Impact:** Two StorageManagers with same bucket but different expiry/credentials get the same cached driver with first config's settings.

**Fix:** Either:
1. Include all relevant config in the key (hash the entire config object)
2. Or don't cache drivers at all
3. Or document this as expected behavior

---

### 37. ❌ Duplicate Environment Variable Reading (MEDIUM)

**Files:** 
- `src/storage-manager.ts` (lines 79-106)
- `src/utils/config.utils.ts` (lines 53-79)

**Problem:**
`StorageManager.buildConfig()` reads environment variables directly. `loadEnvironmentConfig()` in config.utils is exported but never used internally.

**Impact:**
1. `initializeDotenv()` from config.utils may never be called if users don't call `loadAndValidateConfig()`
2. Duplicated code to maintain
3. Inconsistent behavior between using StorageManager vs using the utility functions

**Fix:** Have `StorageManager.buildConfig()` use `loadEnvironmentConfig()` instead of reading env vars directly.

---

### 38. ❌ Azure Connection String AccountName Extraction Could Fail Silently (LOW)

**File:** `src/drivers/azure.driver.ts` (lines 41-44)

**Problem:**
```typescript
const match = config.azureConnectionString.match(/AccountName=([^;]+)/);
if (match && match[1]) {
  this.accountName = match[1];
}
// If match fails, this.accountName stays as ''
```

**Impact:** Malformed connection strings that still work with Azure SDK will have empty `accountName`, causing SAS URL generation to fail with confusing errors.

**Fix:** Validate that accountName was extracted, throw clear error if not.

---

### 39. ❌ generateViewUrls Inconsistent with generateViewUrl (MEDIUM)

**File:** `src/storage-manager.ts` (lines 514-515)

**Problem:**
```typescript
// Singular version enhances results:
async generateViewUrl(reference: string) {
  const result = await this.driver.generateViewUrl(reference);
  if (result.success) {
    return { ...result, reference, expiresIn: this.config.presignedUrlExpiry || 600 };
  }
  return result;
}

// Plural version doesn't:
async generateViewUrls(references: string[]) {
  return this.driver.generateMultipleViewUrls(references);  // Missing enhancement!
}
```

**Impact:** Bulk view URL results don't include `expiresIn` or `reference` while single results do.

**Fix:** Modify `generateViewUrls` to call `this.generateViewUrl()` for each reference (like `generateUploadUrls` does).

---

### 40. ❌ README Example Uses Unsafe Non-null Assertion (LOW)

**File:** `README.md` (line 69)

**Problem:**
```typescript
const result = await storage.uploadFile(req.file!);
```

**Impact:** Users copying this example might not realize `req.file` can be undefined.

**Fix:** Update to show proper null checking:
```typescript
if (!req.file) {
  return res.status(400).json({ success: false, error: 'No file uploaded' });
}
const result = await storage.uploadFile(req.file);
```

---

### 41. ❌ Factory Driver Cache Never Cleared Automatically (LOW)

**File:** `src/factory/driver.factory.ts`

**Problem:**
The static `drivers` Map grows unbounded. While `clearCache()` exists, it's never called automatically.

**Impact:** In long-running processes creating many StorageManager instances with different configs, memory usage grows indefinitely.

**Fix:** Either:
1. Use WeakMap if possible
2. Add LRU eviction
3. Document that users should call `clearCache()` periodically
4. Remove caching entirely (driver creation is cheap)

---

## Resolved Issues (19-31) - January 2026

### 19. ✅ All Drivers Only Support Memory Storage (Buffer) (HIGH)

**Files:** All driver files

**Fix Applied:**
- Added `getFileContent()` helper method to `BaseStorageDriver`
- Checks for `file.buffer` first, falls back to reading from `file.path`
- All drivers now use this helper instead of directly accessing `file.buffer`
- Supports both Multer memory storage and disk storage configurations

---

### 20. ✅ Azure Config Validation Doesn't Account for Managed Identity (HIGH)

**File:** `src/utils/config.utils.ts`

**Fix Applied:**
- Updated validation to differentiate between `azure` and `azure-presigned` drivers
- `azure` driver now accepts: connection string, account+key, OR account only (Managed Identity)
- `azure-presigned` driver requires connection string OR account+key (SAS needs key)
- Clear error messages explain the requirements

---

### 21. ✅ Azure Presigned Driver Doesn't Warn About Managed Identity Incompatibility (HIGH)

**File:** `src/drivers/azure.driver.ts`

**Fix Applied:**
- Added check in `AzurePresignedStorageDriver` constructor
- Throws clear error if account key is not available
- Error message explains that Managed Identity cannot generate SAS URLs
- Suggests using regular `azure` driver instead

---

### 22. ✅ GCS Delete Doesn't Verify File Exists First (MEDIUM)

**File:** `src/drivers/gcs.driver.ts`

**Fix Applied:**
- Added `file.exists()` check before deletion
- Returns `false` if file doesn't exist
- Consistent behavior with S3 driver

---

### 23. ✅ Azure Delete Doesn't Verify File Exists First (MEDIUM)

**File:** `src/drivers/azure.driver.ts`

**Fix Applied:**
- Added `blockBlobClient.exists()` check before deletion
- Returns `false` if blob doesn't exist
- Consistent behavior with S3 and GCS drivers

---

### 24. ✅ Local Storage Pagination - Deleted File Token Edge Case (MEDIUM)

**File:** `src/drivers/local.driver.ts`

**Fix Applied:**
- Changed from exact match to alphabetical comparison for pagination token
- Uses `localeCompare()` to find first file after token
- Handles deleted files gracefully without restarting from beginning
- Returns empty result if all files are before token

---

### 25. ✅ Missing Filename Validation in generateUploadUrl (MEDIUM)

**File:** `src/storage-manager.ts`

**Fix Applied:**
- Added `validateFileName()` function to `file.utils.ts`
- Validates: not empty, max 255 chars, no path separators, no null bytes
- Called at start of `generateUploadUrl()` method
- Returns clear error messages for invalid filenames

---

### 26. ✅ sanitizeFileName Can Produce Empty String (LOW)

**File:** `src/utils/file.utils.ts`

**Fix Applied:**
- `sanitizeFileName()` now returns `'file'` if sanitization produces empty string
- Handles filenames consisting entirely of special characters

---

### 27. ✅ generateUniqueFileName Doesn't Handle Empty Extension Gracefully (LOW)

**File:** `src/utils/file.utils.ts`

**Fix Applied:**
- Added check for empty baseName after sanitization
- Uses `'file'` as fallback if baseName is empty
- Files without extensions (Dockerfile, README) now handled correctly

---

### 28. ✅ withRetry Parameter Naming Misleading (LOW)

**File:** `src/utils/file.utils.ts`

**Fix Applied:**
- Renamed `maxRetries` to `maxAttempts` in `RetryOptions` interface
- Updated documentation to clarify: `maxAttempts: 3` means 3 total attempts
- Added JSDoc examples showing usage
- Error message now says "failed after N attempts"

---

### 29. ✅ Azure validateAndConfirmUpload Auto-Deletes Without Option (LOW)

**File:** `src/drivers/azure.driver.ts`

**Fix Applied:**
- Added `deleteOnFailure?: boolean` option to `BlobValidationOptions`
- Defaults to `true` for backwards compatibility
- Set to `false` to keep blob for inspection on validation failure
- Error message indicates whether blob was deleted or kept

---

### 30. ✅ Local Storage Month Path Creates Non-Standard Structure (LOW)

**File:** `src/utils/file.utils.ts`

**Fix Applied:**
- Changed from `month/year` (e.g., `january/2026`) to `YYYY/MM` (e.g., `2026/01`)
- Better for chronological sorting
- Shorter paths
- Locale-independent

---

### 31. ✅ Windows Path Separator Handling Incomplete (LOW)

**File:** `src/drivers/local.driver.ts`

**Fix Applied:**
- Added `normalizePathSeparators()` helper method
- Added `normalizeUrl()` helper method
- All path operations now normalize to forward slashes before string comparisons
- URLs are properly normalized regardless of OS

---

## Previously Resolved Issues (1-18)

### 1. ✅ Local Storage - File Deletion Searches Wrong Path (CRITICAL)

**Fix Applied:** Added `resolveFilePath()` method that handles full relative paths.

---

### 2. ✅ Local Storage - Pagination Token Ignored (CRITICAL)

**Fix Applied:** Implemented proper token-based pagination with alphabetical sorting.

---

### 3. ✅ S3/GCS/Azure Presigned Drivers - Upload Method Ignores Constraints (HIGH)

**Fix Applied:** All presigned driver `upload()` methods now pass constraints to `generateUploadUrl()`.

---

### 4. ✅ Azure Driver - Managed Identity Not Properly Implemented (HIGH)

**Fix Applied:** Added `@azure/identity` package and `DefaultAzureCredential` support.

---

### 5. ✅ Missing BUCKET_PATH in Config Utilities (HIGH)

**Fix Applied:** Added `BUCKET_PATH` and `MAX_FILE_SIZE` to config loading.

---

### 6. ✅ No Input Sanitization for Folder Paths (HIGH)

**Fix Applied:** Added `validateFolderPath()` with path traversal and character validation.

---

### 7. ✅ generateUploadUrls Doesn't Support Constraints (HIGH)

**Fix Applied:** Updated to accept `(string | FileMetadata)[]` with full constraint support.

---

### 8. ✅ S3 Delete Returns True Even When File Doesn't Exist (MEDIUM)

**Fix Applied:** Added `HeadObjectCommand` check before deletion.

---

### 9. ✅ uploadFiles Marks All Files Failed for Single Validation Error (MEDIUM)

**Fix Applied:** Returns individual results per file with specific errors.

---

### 10. ✅ Local Storage URL Generation Incorrect for Custom Paths (MEDIUM)

**Fix Applied:** Added `generateFileUrl()` method that handles custom paths correctly.

---

### 11. ✅ validateFile Assumes Memory Storage (Buffer) (MEDIUM)

**Fix Applied:** Now checks for either `file.buffer` or `file.path`.

---

### 12. ✅ No Maximum Validation for presignedUrlExpiry (MEDIUM)

**Fix Applied:** Added 7-day maximum limit validation.

---

### 13. ✅ Base Driver - generateMultipleUploadUrls Missing Parameters (LOW)

**Fix Applied:** Updated to use `FileMetadata[]` with constraint support.

---

### 14. ✅ Silent Error Swallowing in deleteMultiple (LOW)

**Fix Applied:** Added `DeleteResult` interface with error details.

---

### 15. ✅ dotenv.config() Called at Module Import (LOW)

**Fix Applied:** Converted to lazy initialization with `initializeDotenv()`.

---

### 16. (Documentation) Azure SAS Content-Type Not Enforced (LOW)

**Status:** Documented behavior - Azure SAS tokens don't enforce at URL level.

---

### 17. (Documentation) GCS File Size Type Uncertainty (LOW)

**Status:** Handled in code - supports both string and number types.

---

### 18. (Documentation) Race Condition in Driver Factory Cache (LOW)

**Status:** Accepted - Node.js single-threaded nature makes this theoretical.

---

## Contributing

When adding new issues:
1. Assign a severity level (Critical, High, Medium, Low)
2. Provide file location and line numbers
3. Include code snippets showing the problem
4. Describe the impact
5. Suggest a fix approach

---

*Last updated: January 2026*
*41 total issues: 31 resolved, 10 open*
