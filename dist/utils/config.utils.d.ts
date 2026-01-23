import { StorageConfig, EnvironmentConfig, ValidationResult } from '../types/storage.types.js';
/**
 * Initialize dotenv if not already done
 * Call this before loading environment config if needed
 */
export declare function initializeDotenv(): void;
/**
 * Load environment configuration
 * Automatically initializes dotenv on first call
 */
export declare function loadEnvironmentConfig(): EnvironmentConfig;
/**
 * Convert environment config to storage config
 */
export declare function environmentToStorageConfig(envConfig: EnvironmentConfig): StorageConfig;
/**
 * Validate storage configuration
 */
export declare function validateStorageConfig(config: StorageConfig): ValidationResult;
/**
 * Load and validate configuration from environment
 */
export declare function loadAndValidateConfig(): {
    config: StorageConfig;
    validation: ValidationResult;
};
//# sourceMappingURL=config.utils.d.ts.map