/**
 * Google Cloud Storage Service
 * Provides a wrapper around @google-cloud/storage for file persistence.
 */

import { Storage } from '@google-cloud/storage';

/**
 * Configuration for GCS service
 */
export interface GCSStorageServiceConfig {
    projectId?: string;
    bucketName?: string;
}

/**
 * GCS Storage service class
 */
export class GCSStorageService {
    private storage: Storage;
    private bucketName: string;

    constructor(config: GCSStorageServiceConfig = {}) {
        this.storage = new Storage({
            projectId: config.projectId || process.env.GCP_PROJECT_ID,
        });
        this.bucketName = config.bucketName || process.env.GCS_BUCKET || 'firstline-clinical-docs';
    }

    /**
     * Upload a buffer to GCS
     * @param fileName Name of the file in the bucket
     * @param buffer Content buffer
     * @param contentType MIME type of the file
     * @returns Public or authenticated URL of the file
     */
    public async uploadFile(
        fileName: string,
        buffer: Buffer,
        contentType: string = 'application/pdf'
    ): Promise<string> {
        const file = this.storage.bucket(this.bucketName).file(fileName);

        await file.save(buffer, {
            metadata: { contentType },
            resumable: false
        });

        // In a production app, we'd use signed URLs or GCP's native access control.
        // For the MedGemma challenge demo, we'll return a standard URI.
        return `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
    }

    /**
     * Generate a signed URL for a file
     * @param fileName Path to the file in the bucket
     * @param expiresMinutes Expiration time in minutes
     */
    public async getSignedUrl(fileName: string, expiresMinutes: number = 60): Promise<string> {
        const options = {
            version: 'v4' as const,
            action: 'read' as const,
            expires: Date.now() + expiresMinutes * 60 * 1000,
        };

        const [url] = await this.storage
            .bucket(this.bucketName)
            .file(fileName)
            .getSignedUrl(options);

        return url;
    }
}
