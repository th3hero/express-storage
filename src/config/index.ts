/**
 * express-storage/config
 * 
 * Configuration loading, validation, and environment variable utilities.
 * 
 * @example
 * import { loadAndValidateConfig, validateStorageConfig } from 'express-storage/config';
 */

export {
  loadAndValidateConfig,
  validateStorageConfig,
  initializeDotenv,
  resetDotenvInitialization,
  loadEnvironmentConfig,
  environmentToStorageConfig,
} from '../utils/config.utils.js';
