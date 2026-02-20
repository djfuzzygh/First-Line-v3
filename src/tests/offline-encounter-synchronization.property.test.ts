/**
 * Property-Based Test: Offline Encounter Synchronization
 * Feature: firstline-triage-platform
 * Property 3: Offline Encounter Synchronization
 * 
 * **Validates: Requirements 1.5, 8.4, 8.5**
 * 
 * Test that encounters created offline are synchronized to the backend
 * with original timestamps preserved and offline indicator set.
 */

import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { OfflineSyncService } from '../services/offline-sync.service';
import { Encounter, Followup, TriageResult, Channel } from '../models';

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
    _getStore: () => store, // For debugging
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

describe('Property 3: Offline Encounter Synchronization', () => {
  let service: OfflineSyncService;

  beforeEach(() => {
    localStorageMock.clear();
    service = new OfflineSyncService();
  });

  afterEach(() => {
    service.clearAllOfflineEncounters();
  });

  it('should store and retrieve encounters from local storage', () => {
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

    service.storeOfflineEncounter(encounter);
    const retrieved = service.getOfflineEncounter('test-123');
    
    expect(retrieved).toBeDefined();
    expect(retrieved!.encounter.EncounterId).toBe('test-123');
  });

  it('should preserve original timestamp when synchronizing offline encounters', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        try {
          const originalTimestamp = encounter.Timestamp;
          
          // Store encounter offline
          service.storeOfflineEncounter(encounter);

          // Mock upload function
          let uploadedEncounter: Encounter | null = null;
          const mockUpload = jest.fn(async (enc: Encounter) => {
            uploadedEncounter = enc;
          });

          // Sync the encounter
          const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
          expect(offlineEncounter).toBeDefined();

          const result = await service.syncEncounter(offlineEncounter!, mockUpload);

          expect(result.success).toBe(true);
          expect(mockUpload).toHaveBeenCalled();
          expect(uploadedEncounter).not.toBeNull();
          expect(uploadedEncounter!.Timestamp).toBe(originalTimestamp);
        } finally {
          // Clean up after each iteration
          service.clearAllOfflineEncounters();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should set offline indicator when synchronizing', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Mock upload function
        let uploadedEncounter: Encounter | null = null;
        const mockUpload = jest.fn(async (enc: Encounter) => {
          uploadedEncounter = enc;
        });

        // Sync the encounter
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        const result = await service.syncEncounter(offlineEncounter!, mockUpload);

        expect(result.success).toBe(true);
        expect(uploadedEncounter).not.toBeNull();
        expect(uploadedEncounter!.OfflineCreated).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should set SyncedAt timestamp when synchronizing', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        const beforeSync = Date.now();
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Mock upload function
        let uploadedEncounter: Encounter | null = null;
        const mockUpload = jest.fn(async (enc: Encounter) => {
          uploadedEncounter = enc;
        });

        // Sync the encounter
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        const result = await service.syncEncounter(offlineEncounter!, mockUpload);

        const afterSync = Date.now();

        expect(result.success).toBe(true);
        expect(uploadedEncounter).not.toBeNull();
        expect(uploadedEncounter!.SyncedAt).toBeDefined();
        
        const syncedAtTime = new Date(uploadedEncounter!.SyncedAt!).getTime();
        expect(syncedAtTime).toBeGreaterThanOrEqual(beforeSync);
        expect(syncedAtTime).toBeLessThanOrEqual(afterSync);
      }),
      { numRuns: 100 }
    );
  });

  it('should remove encounter from local storage after successful sync', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Verify it's stored
        expect(service.getOfflineEncounter(encounter.EncounterId)).toBeDefined();

        // Mock upload function
        const mockUpload = jest.fn(async () => {});

        // Sync the encounter
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        const result = await service.syncEncounter(offlineEncounter!, mockUpload);

        expect(result.success).toBe(true);
        expect(service.getOfflineEncounter(encounter.EncounterId)).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('should keep encounter in local storage after failed sync', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Verify it was stored
        const storedBefore = service.getOfflineEncounter(encounter.EncounterId);
        if (!storedBefore) {
          throw new Error(`Encounter ${encounter.EncounterId} was not stored properly`);
        }

        // Mock upload function that fails
        const mockUpload = jest.fn(async () => {
          throw new Error('Network error');
        });

        // Sync the encounter
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        if (!offlineEncounter) {
          const allEncounters = service.getOfflineEncounters();
          throw new Error(
            `Encounter ${encounter.EncounterId} not found. ` +
            `Total encounters in storage: ${allEncounters.length}. ` +
            `IDs: ${allEncounters.map(e => e.encounter.EncounterId).join(', ')}`
          );
        }
        
        const result = await service.syncEncounter(offlineEncounter, mockUpload);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(service.getOfflineEncounter(encounter.EncounterId)).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('should synchronize encounters with followups', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
        async (encounter, questions) => {
          service.clearAllOfflineEncounters(); // Clear before each iteration
          
          const followups = questions.map((_, i) => ({
            PK: `ENC#${encounter.EncounterId}`,
            SK: `FOLLOWUP#${i + 1}`,
            Type: 'Followup' as const,
            Question: `Question ${i + 1}`,
            Response: `Response ${i + 1}`,
            Timestamp: new Date().toISOString(),
          }));

          // Store encounter with followups offline
          service.storeOfflineEncounter(encounter, followups);

          // Mock upload function
          let uploadedFollowups: Followup[] | null = null;
          const mockUpload = jest.fn(async (_enc: Encounter, fups: Followup[]) => {
            uploadedFollowups = fups;
          });

          // Sync the encounter
          const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
          const result = await service.syncEncounter(offlineEncounter!, mockUpload);

          expect(result.success).toBe(true);
          expect(uploadedFollowups).not.toBeNull();
          expect(uploadedFollowups!.length).toBe(followups.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should synchronize encounters with triage results', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        const triageResult: TriageResult = {
          PK: `ENC#${encounter.EncounterId}`,
          SK: 'TRIAGE',
          Type: 'TriageResult',
          RiskTier: 'YELLOW',
          DangerSigns: [],
          Uncertainty: 'LOW',
          RecommendedNextSteps: ['Seek care within 24 hours'],
          WatchOuts: ['Watch for worsening symptoms'],
          ReferralRecommended: false,
          Disclaimer: 'This is not a diagnosis',
          Reasoning: 'Test reasoning',
          AiLatencyMs: 1000,
          UsedFallback: false,
          Timestamp: new Date().toISOString(),
        };

        // Store encounter with triage result offline
        service.storeOfflineEncounter(encounter, [], triageResult);

        // Mock upload function
        let uploadedTriageResult: TriageResult | undefined;
        const mockUpload = jest.fn(
          async (_enc: Encounter, _fups: Followup[], triage?: TriageResult) => {
            uploadedTriageResult = triage;
          }
        );

        // Sync the encounter
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        const result = await service.syncEncounter(offlineEncounter!, mockUpload);

        expect(result.success).toBe(true);
        expect(uploadedTriageResult).toBeDefined();
        expect(uploadedTriageResult!.RiskTier).toBe(triageResult.RiskTier);
      }),
      { numRuns: 100 }
    );
  });

  it('should return sync result with encounterId and success status', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Mock upload function
        const mockUpload = jest.fn(async () => {});

        // Sync the encounter
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        const result = await service.syncEncounter(offlineEncounter!, mockUpload);

        expect(result).toHaveProperty('encounterId');
        expect(result).toHaveProperty('success');
        expect(result.encounterId).toBe(encounter.EncounterId);
        expect(typeof result.success).toBe('boolean');
      }),
      { numRuns: 100 }
    );
  });

  it('should include syncedAt timestamp in successful sync result', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Mock upload function
        const mockUpload = jest.fn(async () => {});

        // Sync the encounter
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        const result = await service.syncEncounter(offlineEncounter!, mockUpload);

        expect(result.success).toBe(true);
        expect(result.syncedAt).toBeDefined();
        expect(result.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }),
      { numRuns: 100 }
    );
  });

  it('should include error message in failed sync result', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), fc.string({ minLength: 5 }), async (encounter, errorMsg) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Mock upload function that fails
        const mockUpload = jest.fn(async () => {
          throw new Error(errorMsg);
        });

        // Sync the encounter
        const offlineEncounter = service.getOfflineEncounter(encounter.EncounterId);
        const result = await service.syncEncounter(offlineEncounter!, mockUpload);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toBe(errorMsg);
      }),
      { numRuns: 100 }
    );
  });
});
