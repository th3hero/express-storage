import { LocalStorageDriver } from '../drivers/local.driver.js';
import { S3StorageDriver, S3PresignedStorageDriver } from '../drivers/s3.driver.js';
import { GCSStorageDriver, GCSPresignedStorageDriver } from '../drivers/gcs.driver.js';
import { AzureStorageDriver, AzurePresignedStorageDriver } from '../drivers/azure.driver.js';
/**
 * Factory class for creating storage drivers
 */
export class StorageDriverFactory {
    /**
     * Create and return a storage driver based on configuration
     */
    static createDriver(config) {
        const driverKey = this.getDriverKey(config);
        // Return cached driver if exists
        if (this.drivers.has(driverKey)) {
            return this.drivers.get(driverKey);
        }
        // Create new driver
        const driver = this.createNewDriver(config);
        // Cache the driver
        this.drivers.set(driverKey, driver);
        return driver;
    }
    /**
     * Create a new driver instance
     */
    static createNewDriver(config) {
        switch (config.driver) {
            case 'local':
                return new LocalStorageDriver(config);
            case 's3':
                return new S3StorageDriver(config);
            case 's3-presigned':
                return new S3PresignedStorageDriver(config);
            case 'gcs':
                return new GCSStorageDriver(config);
            case 'gcs-presigned':
                return new GCSPresignedStorageDriver(config);
            case 'azure':
                return new AzureStorageDriver(config);
            case 'azure-presigned':
                return new AzurePresignedStorageDriver(config);
            default:
                throw new Error(`Unsupported storage driver: ${config.driver}`);
        }
    }
    /**
     * Generate unique key for driver caching
     */
    static getDriverKey(config) {
        return `${config.driver}_${config.bucketName || 'local'}_${config.localPath || 'default'}`;
    }
    /**
     * Clear cached drivers
     */
    static clearCache() {
        this.drivers.clear();
    }
    /**
     * Get available drivers
     */
    static getAvailableDrivers() {
        return [
            'local',
            's3',
            's3-presigned',
            'gcs',
            'gcs-presigned',
            'azure',
            'azure-presigned'
        ];
    }
}
StorageDriverFactory.drivers = new Map();
//# sourceMappingURL=driver.factory.js.map