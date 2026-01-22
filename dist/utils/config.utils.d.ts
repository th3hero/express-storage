import { StorageConfig, EnvironmentConfig, ValidationResult } from '../types/storage.types.js';
/**
 * Load environment configuration
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