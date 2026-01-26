# Contributing to Express Storage

First off, thank you for considering contributing to Express Storage! It's people like you that make this project better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Commit Messages](#commit-messages)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

Express Storage is a unified file storage library for Express.js that supports AWS S3, Google Cloud Storage, Azure Blob Storage, and local disk storage.

Before contributing, please:

1. Check the [issue tracker](https://github.com/th3hero/express-storage/issues) to see if your issue or idea has already been discussed
2. Read through the [README](README.md) to understand the project
3. Familiarize yourself with the codebase structure

## Development Setup

### Prerequisites

- Node.js >= 16.0.0
- npm >= 8.0.0
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/th3hero/express-storage.git
cd express-storage

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Project Structure

```
express-storage/
├── src/
│   ├── index.ts                 # Main exports
│   ├── storage-manager.ts       # Core StorageManager class
│   ├── drivers/                 # Storage provider implementations
│   │   ├── base.driver.ts       # Abstract base class
│   │   ├── local.driver.ts      # Local disk storage
│   │   ├── s3.driver.ts         # AWS S3
│   │   ├── gcs.driver.ts        # Google Cloud Storage
│   │   └── azure.driver.ts      # Azure Blob Storage
│   ├── factory/
│   │   └── driver.factory.ts    # Driver factory with caching
│   ├── types/
│   │   └── storage.types.ts     # TypeScript definitions
│   └── utils/
│       ├── config.utils.ts      # Configuration utilities
│       └── file.utils.ts        # File handling utilities
├── tests/                       # Test files
├── dist/                        # Compiled output (generated)
└── package.json
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Watch mode for development |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix linting issues automatically |
| `npm run type-check` | TypeScript type checking |

## How to Contribute

### Types of Contributions

We welcome many types of contributions:

- **Bug fixes**: Found a bug? We'd love a fix!
- **New features**: Have an idea? Open an issue first to discuss
- **Documentation**: Typos, unclear explanations, missing examples
- **Tests**: More test coverage is always welcome
- **Performance**: Optimizations and benchmarks
- **New storage drivers**: Want to add support for another provider?

### What We're Looking For

- **Security improvements**: We take security seriously
- **Better TypeScript types**: More precise type definitions
- **Error handling**: Better error messages and handling
- **Edge cases**: Handling unusual scenarios gracefully

## Pull Request Process

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following our code style
3. **Add tests** for any new functionality
4. **Update documentation** if needed
5. **Run the test suite** and ensure all tests pass
6. **Run linting** and fix any issues
7. **Submit a pull request**

### PR Checklist

Before submitting your PR, ensure:

- [ ] Code compiles without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] New code has appropriate test coverage
- [ ] Documentation is updated if needed
- [ ] Commit messages follow our conventions

## Code Style

We use ESLint and Prettier to maintain code consistency.

### Guidelines

- Use TypeScript for all new code
- Prefer `async/await` over Promise chains
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and small
- Handle errors explicitly

### Example

```typescript
/**
 * Uploads a file to the configured storage provider.
 * @param file - The file to upload
 * @param options - Upload options
 * @returns Upload result with file URL or error
 */
async uploadFile(
  file: Express.Multer.File,
  options?: UploadOptions
): Promise<FileUploadResult> {
  // Implementation
}
```

## Testing

We use [Vitest](https://vitest.dev/) for testing.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Place test files in the `tests/` directory
- Name test files with `.test.ts` suffix
- Test both success and error cases
- Mock external services (S3, GCS, Azure)

### Example Test

```typescript
import { describe, it, expect } from 'vitest';
import { StorageManager } from '../src';

describe('StorageManager', () => {
  it('should upload a file successfully', async () => {
    const storage = new StorageManager({ driver: 'local' });
    const result = await storage.uploadFile(mockFile);
    
    expect(result.success).toBe(true);
    expect(result.fileName).toBeDefined();
  });
});
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, etc.) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

### Examples

```
feat(s3): add support for S3 Object Lock

fix(azure): handle connection timeout errors

docs: add presigned URL examples

test(local): add edge case tests for path traversal
```

## Reporting Bugs

### Before Reporting

1. Check if the issue already exists
2. Try the latest version
3. Collect relevant information

### Bug Report Template

When reporting a bug, please include:

- **Description**: Clear description of the bug
- **Steps to reproduce**: How can we reproduce this?
- **Expected behavior**: What should happen?
- **Actual behavior**: What actually happens?
- **Environment**: Node.js version, OS, storage provider
- **Code sample**: Minimal reproduction if possible

## Suggesting Features

We love feature suggestions! Please:

1. **Check existing issues** to avoid duplicates
2. **Open an issue** with the `enhancement` label
3. **Describe the use case**: Why is this feature needed?
4. **Propose a solution**: How might this work?

### Feature Request Template

- **Problem**: What problem does this solve?
- **Solution**: How would you like it to work?
- **Alternatives**: Any alternative solutions considered?
- **Context**: Any additional context or screenshots?

## Questions?

Feel free to open an issue with the `question` label or reach out to the maintainer:

- **Author**: Alok Kumar ([@th3hero](https://github.com/th3hero))
- **Issues**: [GitHub Issues](https://github.com/th3hero/express-storage/issues)

---

Thank you for contributing to Express Storage!
