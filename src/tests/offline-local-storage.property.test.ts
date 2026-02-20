/**
 * Property-Based Test: Offline Local Storage
 * Feature: firstline-triage-platform
 * Property 24: Offline Local Storage
 * 
 * **Validates: Requirements 8.3**
 * 
 * Test that encounters created while offline are stored in local device
 * storage and marked with an offline indicator.
 */

import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { OfflineSyncService } from '../services/offline-sync.service';
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

describe('Property 24: Offline Local Storage', () => {
  let service: OfflineSyncService;

  beforeEach(() => {
    localStorageMock.clear();
    service = new OfflineSyncService();
  });

  afterEach(() => {
    service.clearAllOfflineEncounters();
  });

  it('should store encounters in local storage', () => {
    fc.assert(
      fc.property(encounterArb(), (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Verify it's in local storage
        const stored = localStorage.getItem('firstline_offline_encounters');
        expect(stored).not.toBeNull();
        
        const parsed = JSON.parse(stored!);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBe(1);
        expect(parsed[0].encounter.EncounterId).toBe(encounter.EncounterId);
      }),
      { numRuns: 50 }
    );
  });

  it('should mark encounters with offline indicator', () => {
    fc.assert(
      fc.property(encounterArb(), (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Retrieve and check offline indicator
        const retrieved = service.getOfflineEncounter(encounter.EncounterId);
        expect(retrieved).toBeDefined();
        expect(retrieved!.encounter.OfflineCreated).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('should persist multiple encounters in local storage', () => {
    fc.assert(
      fc.property(fc.array(encounterArb(), { minLength: 1, maxLength: 10 }), (encounters) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store all encounters
        encounters.forEach(enc => service.storeOfflineEncounter(enc));

        // Verify all are stored
        const allStored = service.getOfflineEncounters();
        expect(allStored.length).toBe(encounters.length);

        // Verify each encounter can be retrieved
        encounters.forEach(enc => {
          const retrieved = service.getOfflineEncounter(enc.EncounterId);
          expect(retrieved).toBeDefined();
          expect(retrieved!.encounter.EncounterId).toBe(enc.EncounterId);
        });
      }),
      { numRuns: 50 }
    );
  });

  it('should initialize sync tracking fields', () => {
    fc.assert(
      fc.property(encounterArb(), (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter offline
        service.storeOfflineEncounter(encounter);

        // Retrieve and check sync tracking
        const retrieved = service.getOfflineEncounter(encounter.EncounterId);
        expect(retrieved).toBeDefined();
        expect(retrieved!.syncAttempts).toBe(0);
        expect(retrieved!.lastSyncAttempt).toBeUndefined();
        expect(retrieved!.syncError).toBeUndefined();
      }),
      { numRuns: 50 }
    );
  });

  it('should store encounters with followups', () => {
    fc.assert(
      fc.property(
        encounterArb(),
        fc.array(fc.string({ minLength: 10, maxLength: 200 }), { minLength: 1, maxLength: 5 }),
        (encounter, questions) => {
          service.clearAllOfflineEncounters(); // Clear before each iteration
          
          const followups = questions.map((q, i) => ({
            PK: `ENC#${encounter.EncounterId}`,
            SK: `FOLLOWUP#${i + 1}`,
            Type: 'Followup' as const,
            Question: q,
            Response: `Response ${i + 1}`,
            Timestamp: new Date().toISOString(),
          }));

          // Store encounter with followups
          service.storeOfflineEncounter(encounter, followups);

          // Retrieve and verify followups are stored
          const retrieved = service.getOfflineEncounter(encounter.EncounterId);
          expect(retrieved).toBeDefined();
          expect(retrieved!.followups.length).toBe(followups.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should return pending count', () => {
    fc.assert(
      fc.property(fc.array(encounterArb(), { minLength: 0, maxLength: 10 }), (encounters) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store all encounters
        encounters.forEach(enc => service.storeOfflineEncounter(enc));

        // Verify pending count
        expect(service.getPendingCount()).toBe(encounters.length);
      }),
      { numRuns: 50 }
    );
  });

  it('should handle empty storage gracefully', () => {
    service.clearAllOfflineEncounters();
    
    expect(service.getOfflineEncounters()).toEqual([]);
    expect(service.getPendingCount()).toBe(0);
    expect(service.getOfflineEncounter('nonexistent-id')).toBeUndefined();
  });

  it('should update existing offline encounters', () => {
    fc.assert(
      fc.property(encounterArb(), (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter
        service.storeOfflineEncounter(encounter);

        // Update with new data
        service.updateOfflineEncounter(encounter.EncounterId, {
          syncAttempts: 3,
          lastSyncAttempt: new Date().toISOString(),
          syncError: 'Test error',
        });

        // Verify updates
        const retrieved = service.getOfflineEncounter(encounter.EncounterId);
        expect(retrieved).toBeDefined();
        expect(retrieved!.syncAttempts).toBe(3);
        expect(retrieved!.lastSyncAttempt).toBeDefined();
        expect(retrieved!.syncError).toBe('Test error');
      }),
      { numRuns: 50 }
    );
  });

  it('should remove encounters from storage', () => {
    fc.assert(
      fc.property(encounterArb(), (encounter) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store encounter
        service.storeOfflineEncounter(encounter);
        expect(service.getOfflineEncounter(encounter.EncounterId)).toBeDefined();

        // Remove encounter
        service.removeOfflineEncounter(encounter.EncounterId);
        expect(service.getOfflineEncounter(encounter.EncounterId)).toBeUndefined();
      }),
      { numRuns: 50 }
    );
  });

  it('should clear all offline encounters', () => {
    fc.assert(
      fc.property(fc.array(encounterArb(), { minLength: 1, maxLength: 10 }), (encounters) => {
        service.clearAllOfflineEncounters(); // Clear before each iteration
        
        // Store all encounters
        encounters.forEach(enc => service.storeOfflineEncounter(enc));
        expect(service.getPendingCount()).toBeGreaterThan(0);

        // Clear all
        service.clearAllOfflineEncounters();
        expect(service.getPendingCount()).toBe(0);
        expect(service.getOfflineEncounters()).toEqual([]);
      }),
      { numRuns: 50 }
    );
  });
});
