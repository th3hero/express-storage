import { StorageConfig, IStorageDriver } from '../types/storage.types.js';
/**
 * Factory class for creating storage drivers
 */
export declare class StorageDriverFactory {
    private static drivers;
    /**
     * Create and return a storage driver based on configuration
     */
    static createDriver(config: StorageConfig): IStorageDriver;
    /**
     * Create a new driver instance
     */
    private static createNewDriver;
    /**
     * Generate unique key for driver caching
     */
    private static getDriverKey;
    /**
     * Clear cached drivers
     */
    static clearCache(): void;
    /**
     * Get available drivers
     */
    static getAvailableDrivers(): string[];
}
//# sourceMappingURL=driver.factory.d.ts.map