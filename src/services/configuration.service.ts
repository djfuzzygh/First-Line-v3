/**
 * ConfigurationService
 * 
 * Manages local health protocol configuration for the triage system.
 * Stores protocols in DynamoDB, provides caching at Lambda initialization,
 * and supports updates via API.
 * 
 * Requirements: 14.5
 */

import { FirestoreService } from './firestore.service';

/**
 * Local health protocol configuration
 */
export interface HealthProtocol {
  PK: string; // CONFIG#protocols
  SK: string; // VERSION#{version}
  Type: 'HealthProtocol';
  Version: string;
  Content: string;
  Description: string;
  CreatedAt: string; // ISO8601
  UpdatedAt: string; // ISO8601
  Active: boolean;
}

/**
 * Configuration for the ConfigurationService
 */
export interface ConfigurationServiceConfig {
  firestoreService: FirestoreService;
  cacheEnabled?: boolean;
}

/**
 * ConfigurationService class
 * Manages local health protocols with caching support
 */
export class ConfigurationService {
  private firestoreService: FirestoreService;
  private cacheEnabled: boolean;
  private cachedProtocol: string | null = null;
  private cacheTimestamp: number = 0;
  private cacheTTLMs: number = 5 * 60 * 1000; // 5 minutes

  /**
   * Create a new ConfigurationService instance
   * 
   * @param config - Configuration options
   */
  constructor(config: ConfigurationServiceConfig) {
    this.firestoreService = config.firestoreService;
    this.cacheEnabled = config.cacheEnabled ?? true;
  }

  /**
   * Generate partition key for configuration
   */
  private generateConfigPK(): string {
    return 'CONFIG#protocols';
  }

  /**
   * Generate sort key for protocol version
   */
  private generateVersionSK(version: string): string {
    return `VERSION#${version}`;
  }

  /**
   * Generate sort key for active protocol
   */
  private generateActiveSK(): string {
    return 'ACTIVE';
  }

  /**
   * Get the active local health protocol
   * Uses cache if enabled and valid
   * 
   * @returns The active protocol content, or default WHO guidelines
   */
  async getActiveProtocol(): Promise<string> {
    // Check cache first
    if (this.cacheEnabled && this.isCacheValid()) {
      return this.cachedProtocol!;
    }

    try {
      // Query for active protocol
      const pk = this.generateConfigPK();
      const sk = this.generateActiveSK();

      const result = await this.firestoreService.get(pk, sk);

      if (result && result.Content) {
        const protocol = result.Content as string;

        // Update cache
        if (this.cacheEnabled) {
          this.cachedProtocol = protocol;
          this.cacheTimestamp = Date.now();
        }

        return protocol;
      }

      // Return default if no active protocol found
      return this.getDefaultProtocol();
    } catch (error) {
      console.error('Error fetching active protocol:', error);
      // Return default on error
      return this.getDefaultProtocol();
    }
  }

  /**
   * Get the default WHO guidelines protocol
   */
  private getDefaultProtocol(): string {
    return 'Standard WHO guidelines for primary healthcare in low-resource settings.';
  }

  /**
   * Check if the cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cachedProtocol) {
      return false;
    }

    const now = Date.now();
    const age = now - this.cacheTimestamp;

    return age < this.cacheTTLMs;
  }

  /**
   * Set a new local health protocol
   */
  async setProtocol(
    content: string,
    description: string,
    version?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const protocolVersion = version ?? timestamp;

    const pk = this.generateConfigPK();

    // Create versioned protocol entry
    const versionedProtocol: HealthProtocol = {
      PK: pk,
      SK: this.generateVersionSK(protocolVersion),
      Type: 'HealthProtocol',
      Version: protocolVersion,
      Content: content,
      Description: description,
      CreatedAt: timestamp,
      UpdatedAt: timestamp,
      Active: false,
    };

    // Create active protocol entry
    const activeProtocol = {
      PK: pk,
      SK: this.generateActiveSK(),
      Type: 'HealthProtocol',
      Version: protocolVersion,
      Content: content,
      Description: description,
      CreatedAt: timestamp,
      UpdatedAt: timestamp,
      Active: true,
    };

    // Store both entries in Firestore
    await this.firestoreService.put(versionedProtocol);
    await this.firestoreService.put(activeProtocol);

    // Invalidate cache
    this.invalidateCache();

    return protocolVersion;
  }

  /**
   * Get a specific protocol version
   */
  async getProtocolVersion(version: string): Promise<HealthProtocol | null> {
    const pk = this.generateConfigPK();
    const sk = this.generateVersionSK(version);

    const result = await this.firestoreService.get(pk, sk);

    if (!result) {
      return null;
    }

    return result as HealthProtocol;
  }

  /**
   * List all protocol versions
   */
  async listProtocolVersions(): Promise<HealthProtocol[]> {
    const pk = this.generateConfigPK();
    const results = await this.firestoreService.query(pk, 'VERSION#');
    return results as HealthProtocol[];
  }

  /**
   * Invalidate the protocol cache
   */
  invalidateCache(): void {
    this.cachedProtocol = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Preload the active protocol into cache
   */
  async preloadProtocol(): Promise<string> {
    return await this.getActiveProtocol();
  }
}
