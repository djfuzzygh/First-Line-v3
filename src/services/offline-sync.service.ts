/**
 * Offline Storage and Synchronization Service
 * 
 * Handles offline encounter creation, local storage, and synchronization
 * when network connectivity is restored.
 * 
 * Requirements: 1.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { Encounter, TriageResult, Followup } from '../models';

/**
 * Local storage schema for offline encounters
 */
export interface OfflineEncounter {
  encounter: Encounter;
  followups: Followup[];
  triageResult?: TriageResult;
  syncAttempts: number;
  lastSyncAttempt?: string; // ISO8601
  syncError?: string;
}

/**
 * Sync result for tracking synchronization outcomes
 */
export interface SyncResult {
  encounterId: string;
  success: boolean;
  error?: string;
  syncedAt?: string;
}

/**
 * Configuration for exponential backoff retry logic
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Default retry configuration with exponential backoff
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 60000, // 60 seconds
};

/**
 * OfflineSyncService handles offline encounter storage and synchronization
 */
export class OfflineSyncService {
  private storageKey = 'firstline_offline_encounters';
  private retryConfig: RetryConfig;

  constructor(retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig;
  }

  /**
   * Store an encounter locally for offline access
   * Marks the encounter with offline indicator
   */
  storeOfflineEncounter(encounter: Encounter, followups: Followup[] = [], triageResult?: TriageResult): void {
    // Ensure offline indicator is set
    encounter.OfflineCreated = true;

    const offlineEncounter: OfflineEncounter = {
      encounter,
      followups,
      triageResult,
      syncAttempts: 0,
    };

    const stored = this.getStoredEncounters();
    stored.push(offlineEncounter);
    this.saveToStorage(stored);
  }

  /**
   * Retrieve all offline encounters from local storage
   */
  getOfflineEncounters(): OfflineEncounter[] {
    return this.getStoredEncounters();
  }

  /**
   * Get a specific offline encounter by ID
   */
  getOfflineEncounter(encounterId: string): OfflineEncounter | undefined {
    const stored = this.getStoredEncounters();
    return stored.find(e => e.encounter.EncounterId === encounterId);
  }

  /**
   * Update an existing offline encounter
   */
  updateOfflineEncounter(encounterId: string, updates: Partial<OfflineEncounter>): void {
    const stored = this.getStoredEncounters();
    const index = stored.findIndex(e => e.encounter.EncounterId === encounterId);
    
    if (index !== -1) {
      stored[index] = { ...stored[index], ...updates };
      this.saveToStorage(stored);
    }
  }

  /**
   * Remove an encounter from offline storage after successful sync
   */
  removeOfflineEncounter(encounterId: string): void {
    const stored = this.getStoredEncounters();
    const filtered = stored.filter(e => e.encounter.EncounterId !== encounterId);
    this.saveToStorage(filtered);
  }

  /**
   * Calculate exponential backoff delay based on attempt number
   */
  calculateBackoffDelay(attemptNumber: number): number {
    const delay = this.retryConfig.baseDelayMs * Math.pow(2, attemptNumber);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  /**
   * Check if an encounter should be retried based on backoff logic
   */
  shouldRetry(offlineEncounter: OfflineEncounter): boolean {
    // Check if max attempts exceeded
    if (offlineEncounter.syncAttempts >= this.retryConfig.maxAttempts) {
      return false;
    }

    // If no previous attempt, allow retry
    if (!offlineEncounter.lastSyncAttempt) {
      return true;
    }

    // Calculate required delay based on attempt number
    const requiredDelay = this.calculateBackoffDelay(offlineEncounter.syncAttempts - 1);
    const lastAttemptTime = new Date(offlineEncounter.lastSyncAttempt).getTime();
    const now = Date.now();
    const timeSinceLastAttempt = now - lastAttemptTime;

    return timeSinceLastAttempt >= requiredDelay;
  }

  /**
   * Synchronize a single offline encounter to the backend
   * Preserves original timestamp and sets offline indicator
   */
  async syncEncounter(
    offlineEncounter: OfflineEncounter,
    uploadFn: (encounter: Encounter, followups: Followup[], triageResult?: TriageResult) => Promise<void>
  ): Promise<SyncResult> {
    const { encounter, followups, triageResult } = offlineEncounter;

    try {
      // Ensure offline indicator and original timestamp are preserved
      encounter.OfflineCreated = true;
      encounter.SyncedAt = new Date().toISOString();

      // Upload to backend
      await uploadFn(encounter, followups, triageResult);

      // Remove from local storage on success
      this.removeOfflineEncounter(encounter.EncounterId);

      return {
        encounterId: encounter.EncounterId,
        success: true,
        syncedAt: encounter.SyncedAt,
      };
    } catch (error) {
      // Update sync attempt tracking
      const updatedEncounter: Partial<OfflineEncounter> = {
        syncAttempts: offlineEncounter.syncAttempts + 1,
        lastSyncAttempt: new Date().toISOString(),
        syncError: error instanceof Error ? error.message : 'Unknown error',
      };

      this.updateOfflineEncounter(encounter.EncounterId, updatedEncounter);

      return {
        encounterId: encounter.EncounterId,
        success: false,
        error: updatedEncounter.syncError,
      };
    }
  }

  /**
   * Synchronize all offline encounters when connectivity is restored
   * Uses exponential backoff for failed attempts
   */
  async syncAllEncounters(
    uploadFn: (encounter: Encounter, followups: Followup[], triageResult?: TriageResult) => Promise<void>
  ): Promise<SyncResult[]> {
    const offlineEncounters = this.getOfflineEncounters();
    const results: SyncResult[] = [];

    for (const offlineEncounter of offlineEncounters) {
      // Check if this encounter should be retried based on backoff logic
      if (!this.shouldRetry(offlineEncounter)) {
        const nextRetryDelay = this.calculateBackoffDelay(offlineEncounter.syncAttempts);
        results.push({
          encounterId: offlineEncounter.encounter.EncounterId,
          success: false,
          error: `Waiting for backoff delay (${nextRetryDelay}ms)`,
        });
        continue;
      }

      const result = await this.syncEncounter(offlineEncounter, uploadFn);
      results.push(result);
    }

    return results;
  }

  /**
   * Get count of pending offline encounters
   */
  getPendingCount(): number {
    return this.getStoredEncounters().length;
  }

  /**
   * Clear all offline encounters (use with caution)
   */
  clearAllOfflineEncounters(): void {
    this.saveToStorage([]);
  }

  /**
   * Private helper to retrieve stored encounters from storage
   */
  private getStoredEncounters(): OfflineEncounter[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to retrieve offline encounters:', error);
      return [];
    }
  }

  /**
   * Private helper to save encounters to storage
   */
  private saveToStorage(encounters: OfflineEncounter[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(encounters));
    } catch (error) {
      console.error('Failed to save offline encounters:', error);
      throw new Error('Failed to save to local storage');
    }
  }
}

/**
 * Singleton instance for global access
 */
export const offlineSyncService = new OfflineSyncService();
