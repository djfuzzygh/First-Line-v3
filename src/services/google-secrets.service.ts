/**
 * Google Cloud Secret Manager Service
 * Provides a wrapper around @google-cloud/secret-manager for credential management.
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

/**
 * Configuration for Google Secrets service
 */
export interface GoogleSecretsServiceConfig {
    projectId?: string;
}

/**
 * Google Secrets service class
 */
export class GoogleSecretsService {
    private client: SecretManagerServiceClient;
    private projectId: string;

    constructor(config: GoogleSecretsServiceConfig = {}) {
        this.client = new SecretManagerServiceClient();
        this.projectId = config.projectId || process.env.GCP_PROJECT_ID || '';
    }

    /**
     * Access a secret value by name
     * @param secretName Name of the secret (e.g., 'jwt-secret')
     * @param version Secret version (default: 'latest')
     */
    public async getSecret(secretName: string, version: string = 'latest'): Promise<string> {
        const name = `projects/${this.projectId}/secrets/${secretName}/versions/${version}`;
        const envFallback = process.env[secretName.toUpperCase().replace(/-/g, '_')] || '';
        const runningOnCloud = Boolean(process.env.K_SERVICE);

        if (!runningOnCloud || process.env.DISABLE_SECRET_MANAGER === 'true' || !this.projectId) {
            return envFallback;
        }

        try {
            const [response] = await this.client.accessSecretVersion({ name });
            const payload = response.payload?.data?.toString();

            if (!payload) {
                throw new Error(`Secret ${secretName} payload is empty`);
            }

            return payload;
        } catch (error) {
            console.error(`Error accessing secret ${secretName}:`, error);
            // Fallback to env for development/local parity if configured
            return envFallback;
        }
    }
}
