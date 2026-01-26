# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Improved SEO and package discoverability
- Additional documentation and community files

## [1.1.4] - 2025-01-XX

### Changed
- Removed GitHub Packages publishing (npm-only distribution)
- Simplified package distribution strategy

### Fixed
- Package naming conflicts resolved

## [1.1.3] - 2025-01-XX

### Added
- GitHub Packages publishing support (later removed)

## [1.1.2] - 2025-01-XX

### Changed
- Migrated to npm trusted publishing for secure releases

## [1.1.1] - 2025-01-XX

### Added
- npm trusted publishing support
- Automated CI/CD pipeline improvements

## [1.1.0] - 2025-01-XX

### Added
- **Multi-cloud storage support**: AWS S3, Google Cloud Storage, Azure Blob Storage, and local disk
- **Unified API**: Single interface for all storage providers
- **Security features**:
  - Path traversal prevention
  - Filename sanitization
  - Null byte protection
  - File validation (size, MIME type, extensions)
- **Presigned URLs**: Client-side direct uploads for S3, GCS, and Azure
- **Large file handling**: Automatic streaming for files >100MB
- **TypeScript support**: Full type definitions and intelligent autocomplete
- **Driver caching**: LRU cache for optimized performance
- **Batch operations**: Upload/delete multiple files with concurrency limits
- **Custom logging**: Pluggable logger interface
- **Retry mechanism**: Exponential backoff for transient failures
- **Utility functions**: File type helpers, size formatting, and more

### Security
- Built-in protection against common file upload vulnerabilities
- Secure filename generation: `{timestamp}_{random}_{sanitized_name}`
- Azure post-upload validation for presigned URL uploads

## [1.0.0] - 2025-01-XX

### Added
- Initial release
- Core storage abstraction layer
- Express.js middleware integration
- Multer compatibility
- Basic file upload and management operations

---

[Unreleased]: https://github.com/th3hero/express-storage/compare/V1.1.4...HEAD
[1.1.4]: https://github.com/th3hero/express-storage/compare/V1.1.3...V1.1.4
[1.1.3]: https://github.com/th3hero/express-storage/compare/V1.1.2...V1.1.3
[1.1.2]: https://github.com/th3hero/express-storage/compare/V1.1.1...V1.1.2
[1.1.1]: https://github.com/th3hero/express-storage/compare/V1.1.0...V1.1.1
[1.1.0]: https://github.com/th3hero/express-storage/compare/V1.0.0...V1.1.0
[1.0.0]: https://github.com/th3hero/express-storage/releases/tag/V1.0.0
