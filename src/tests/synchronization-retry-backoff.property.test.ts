/**
 * Property-Based Test: Synchronization Retry with Backoff
 * Feature: firstline-triage-platform
 * Property 25: Synchronization Retry with Backoff
 * 
 * **Validates: Requirements 8.6**
 * 
 * Test that failed synchronization attempts retry with exponentially
 * increasing delays between attempts.
 */

import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { OfflineSyncService, RetryConfig } from '../services/offline-sync.service';
import { Encounter, Channel } from '../models';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Generators for test data
const channelArb = (): fc.Arbitrary<Channel> =>
  fc.oneof(
    fc.constant('app' as const),
    fc.constant('voice' as const),
    fc.constant('ussd' as const),
    fc.constant('sms' as const)
  );

const encounterArb = (): fc.Arbitrary<Encounter> =>
  fc.string().chain(() => {
    const id = uuidv4();
    return fc.record({
      PK: fc.constant(`ENC#${id}`),
      SK: fc.constant('METADATA'),
      Type: fc.constant('Encounter' as const),
      EncounterId: fc.constant(id),
      Channel: channelArb(),
      Timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
      Status: fc.oneof(
        fc.constant('created' as const),
        fc.constant('in_progress' as const),
        fc.constant('completed' as const)
      ),
      Demographics: fc.record({
        age: fc.integer({ min: 0, max: 120 }),
        sex: fc.oneof(
          fc.constant('M' as const),
          fc.constant('F' as const),
          fc.constant('O' as const)
        ),
        location: fc.string({ minLength: 1, maxLength: 100 }),
      }),
      Symptoms: fc.string({ minLength: 10, maxLength: 500 }),
      Vitals: fc.option(
        fc.record({
          temperature: fc.option(fc.float({ min: 35, max: 42 }), { nil: undefined }),
          pulse: fc.option(fc.integer({ min: 40, max: 200 }), { nil: undefined }),
          bloodPressure: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          respiratoryRate: fc.option(fc.integer({ min: 10, max: 40 }), { nil: undefined }),
        }),
        { nil: undefined }
      ),
      OfflineCreated: fc.boolean(),
      SyncedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()), { nil: undefined }),
      GSI1PK: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => `DATE#${d.toISOString().split('T')[0]}`),
      GSI1SK: fc.tuple(channelArb(), fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })).map(
        ([channel, date]) => `CHANNEL#${channel}#TIME#${date.toISOString()}`
      ),
      TTL: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60 }),
    });
  });

describe('Property 25: Synchronization Retry with Backoff', () => {
  let service: OfflineSyncService;
  const retryConfig: RetryConfig = {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
  };

  beforeEach(() => {
    localStorageMock.clear();
    service = new OfflineSyncService(retryConfig);
  });

  afterEach(() => {
    service.clearAllOfflineEncounters();
  });

  it('should calculate exponential backoff delay', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), (attemptNumber) => {
        const delay = service.calculateBackoffDelay(attemptNumber);
        
        // Delay should be exponential: baseDelay * 2^attemptNumber
        const expectedDelay = Math.min(
          retryConfig.baseDelayMs * Math.pow(2, attemptNumber),
          retryConfig.maxDelayMs
        );
        
        expect(delay).toBe(expectedDelay);
      }),
      { numRuns: 50 }
    );
  });

  it('should respect maximum delay cap', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 20 }), (attemptNumber) => {
        const delay = service.calculateBackoffDelay(attemptNumber);
        
        // Delay should never exceed maxDelayMs
        expect(delay).toBeLessThanOrEqual(retryConfig.maxDelayMs);
      }),
      { numRuns: 50 }
    );
  });

  it('should increment sync attempts on failed sync', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter
        service.storeOfflineEncounter(encounter);

        // Mock upload function that fails
        const mockUpload = jest.fn(async () => {
          throw new Error('Network error');
        });

        // Attempt sync
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        await service.syncEncounter(offlineEncounter!, mockUpload);

        // Check sync attempts incremented
        const updated = service.getOfflineEncounter(encounter.EncounterId);
        expect(updated).toBeDefined();
        expect(updated!.syncAttempts).toBe(1);
      }),
      { numRuns: 50 }
    );
  });

  it('should record last sync attempt timestamp', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        const beforeSync = Date.now();
        
        // Store encounter
        service.storeOfflineEncounter(encounter);

        // Mock upload function that fails
        const mockUpload = jest.fn(async () => {
          throw new Error('Network error');
        });

        // Attempt sync
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        await service.syncEncounter(offlineEncounter!, mockUpload);

        const afterSync = Date.now();

        // Check last sync attempt recorded
        const updated = service.getOfflineEncounter(encounter.EncounterId);
        expect(updated).toBeDefined();
        expect(updated!.lastSyncAttempt).toBeDefined();
        
        const lastAttemptTime = new Date(updated!.lastSyncAttempt!).getTime();
        expect(lastAttemptTime).toBeGreaterThanOrEqual(beforeSync);
        expect(lastAttemptTime).toBeLessThanOrEqual(afterSync);
      }),
      { numRuns: 50 }
    );
  });

  it('should record sync error message', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), fc.string({ minLength: 5 }), async (encounter, errorMsg) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter
        service.storeOfflineEncounter(encounter);

        // Mock upload function that fails with specific error
        const mockUpload = jest.fn(async () => {
          throw new Error(errorMsg);
        });

        // Attempt sync
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        await service.syncEncounter(offlineEncounter!, mockUpload);

        // Check error recorded
        const updated = service.getOfflineEncounter(encounter.EncounterId);
        expect(updated).toBeDefined();
        expect(updated!.syncError).toBe(errorMsg);
      }),
      { numRuns: 50 }
    );
  });

  it('should not retry immediately after failed sync', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter
        service.storeOfflineEncounter(encounter);

        // Mock upload function that fails
        const mockUpload = jest.fn(async () => {
          throw new Error('Network error');
        });

        // First sync attempt
        const offlineEncounter1 = service.getOfflineEncounter(encounter.EncounterId);
        await service.syncEncounter(offlineEncounter1!, mockUpload);

        // Check if should retry immediately (should be false)
        const updated = service.getOfflineEncounter(encounter.EncounterId);
        expect(updated).toBeDefined();
        
        // Should not retry immediately because backoff delay hasn't passed
        const shouldRetry = service.shouldRetry(updated!);
        expect(shouldRetry).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  it('should allow retry after backoff delay', async () => {
    const encounter: Encounter = {
      PK: 'ENC#test-123',
      SK: 'METADATA',
      Type: 'Encounter',
      EncounterId: 'test-123',
      Channel: 'app',
      Timestamp: new Date().toISOString(),
      Status: 'created',
      Demographics: { age: 30, sex: 'M', location: 'Test' },
      Symptoms: 'Test symptoms',
      OfflineCreated: false,
      GSI1PK: 'DATE#2024-01-01',
      GSI1SK: 'CHANNEL#app#TIME#2024-01-01T00:00:00.000Z',
      TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    };

    // Store encounter
    service.storeOfflineEncounter(encounter);

    // Simulate a failed sync attempt from the past
    const pastTime = new Date(Date.now() - 2000).toISOString(); // 2 seconds ago
    service.updateOfflineEncounter('test-123', {
      syncAttempts: 1,
      lastSyncAttempt: pastTime,
      syncError: 'Network error',
    });

    // Check if should retry (should be true since enough time has passed)
    const updated = service.getOfflineEncounter('test-123');
    expect(updated).toBeDefined();
    
    const shouldRetry = service.shouldRetry(updated!);
    expect(shouldRetry).toBe(true);
  });

  it('should stop retrying after max attempts', () => {
    fc.assert(
      fc.property(encounterArb(), (encounter) => {
        service.clearAllOfflineEncounters();
        
        // Store encounter
        service.storeOfflineEncounter(encounter);

        // Simulate max attempts reached
        service.updateOfflineEncounter(encounter.EncounterId, {
          syncAttempts: retryConfig.maxAttempts,
          lastSyncAttempt: new Date().toISOString(),
          syncError: 'Max attempts reached',
        });

        // Check if should retry (should be false)
        const updated = service.getOfflineEncounter(encounter.EncounterId);
        expect(updated).toBeDefined();
        
        const shouldRetry = service.shouldRetry(updated!);
        expect(shouldRetry).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  it('should allow first retry attempt', () => {
    fc.assert(
      fc.property(encounterArb(), (encounter) => {
        service.clearAllOfflineEncounters();
        
        // Store encounter with no previous sync attempts
        service.storeOfflineEncounter(encounter);

        // Check if should retry (should be true for first attempt)
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        expect(offlineEncounter).toBeDefined();
        
        const shouldRetry = service.shouldRetry(offlineEncounter!);
        expect(shouldRetry).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('should skip encounters waiting for backoff in syncAll', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(encounterArb(), { minLength: 2, maxLength: 5 }),
        async (encounters) => {
          service.clearAllOfflineEncounters(); // Clear before each iteration
          
          // Store all encounters
          encounters.forEach(enc => service.storeOfflineEncounter(enc));

          // Mark first encounter as recently failed (should not retry)
          service.updateOfflineEncounter(encounters[0].EncounterId, {
            syncAttempts: 1,
            lastSyncAttempt: new Date().toISOString(),
            syncError: 'Network error',
          });

          // Mock upload function
          const mockUpload = jest.fn(async () => {});

          // Sync all
          const results = await service.syncAllEncounters(mockUpload);

          // First encounter should be skipped (waiting for backoff)
          const firstResult = results.find(r => r.encounterId === encounters[0].EncounterId);
          expect(firstResult).toBeDefined();
          expect(firstResult!.success).toBe(false);
          expect(firstResult!.error).toContain('backoff');

          // Other encounters should sync successfully
          const otherResults = results.filter(r => r.encounterId !== encounters[0].EncounterId);
          otherResults.forEach(result => {
            expect(result.success).toBe(true);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should increase delay exponentially with each attempt', () => {
    const delays = [0, 1, 2, 3, 4].map(attempt => service.calculateBackoffDelay(attempt));
    
    // Each delay should be double the previous (until max is reached)
    for (let i = 1; i < delays.length; i++) {
      if (delays[i] < retryConfig.maxDelayMs) {
        expect(delays[i]).toBe(delays[i - 1] * 2);
      }
    }
  });
});
