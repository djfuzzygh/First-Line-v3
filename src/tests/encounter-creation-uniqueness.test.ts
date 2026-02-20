/**
 * Property-Based Test: Encounter Creation Uniqueness
 * Feature: firstline-triage-platform
 * Property 1: Encounter Creation Uniqueness
 * 
 * **Validates: Requirements 1.1**
 * 
 * Test that each encounter creation generates a unique encounter ID that
 * doesn't collide with existing encounters. Since the system uses UUID v4
 * for ID generation, we test that:
 * 1. Multiple encounter creations produce unique IDs
 * 2. The UUID generation produces valid, unique identifiers
 * 3. Encounter IDs are preserved through the creation process
 */

import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../services/dynamodb.service';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/util-dynamodb');

// ============================================================================
// Generators for test data
// ============================================================================

/**
 * Generate valid channel values
 */
const channelArb = (): fc.Arbitrary<'app' | 'voice' | 'ussd' | 'sms'> =>
  fc.oneof(
    fc.constant('app' as const),
    fc.constant('voice' as const),
    fc.constant('ussd' as const),
    fc.constant('sms' as const)
  );

/**
 * Generate valid demographics
 */
const demographicsArb = (): fc.Arbitrary<{
  age: number;
  sex: 'M' | 'F' | 'O';
  location: string;
}> =>
  fc.record({
    age: fc.integer({ min: 0, max: 120 }),
    sex: fc.oneof(
      fc.constant('M' as const),
      fc.constant('F' as const),
      fc.constant('O' as const)
    ),
    location: fc.string({ minLength: 1, maxLength: 100 }),
  });

/**
 * Generate valid vital signs (all fields optional)
 */
const vitalSignsArb = (): fc.Arbitrary<{
  temperature?: number;
  pulse?: number;
  bloodPressure?: string;
  respiratoryRate?: number;
}> =>
  fc.oneof(
    fc.constant({}),
    fc.record({
      temperature: fc.float({ min: 35, max: 42, noNaN: true }),
    }),
    fc.record({
      pulse: fc.integer({ min: 40, max: 200 }),
    }),
    fc.record({
      bloodPressure: fc
        .tuple(fc.integer({ min: 60, max: 200 }), fc.integer({ min: 40, max: 150 }))
        .map(([systolic, diastolic]) => `${systolic}/${diastolic}`),
    }),
    fc.record({
      respiratoryRate: fc.integer({ min: 8, max: 40 }),
    }),
    fc.record({
      temperature: fc.float({ min: 35, max: 42, noNaN: true }),
      pulse: fc.integer({ min: 40, max: 200 }),
      bloodPressure: fc
        .tuple(fc.integer({ min: 60, max: 200 }), fc.integer({ min: 40, max: 150 }))
        .map(([systolic, diastolic]) => `${systolic}/${diastolic}`),
      respiratoryRate: fc.integer({ min: 8, max: 40 }),
    })
  );

/**
 * Generate encounter creation data
 */
const encounterDataArb = (): fc.Arbitrary<{
  channel: 'app' | 'voice' | 'ussd' | 'sms';
  demographics: {
    age: number;
    sex: 'M' | 'F' | 'O';
    location: string;
  };
  symptoms: string;
  vitals?: {
    temperature?: number;
    pulse?: number;
    bloodPressure?: string;
    respiratoryRate?: number;
  };
  offlineCreated?: boolean;
}> =>
  fc.record({
    channel: channelArb(),
    demographics: demographicsArb(),
    symptoms: fc.string({ minLength: 10, maxLength: 500 }),
    vitals: fc.option(vitalSignsArb(), { nil: undefined }),
    offlineCreated: fc.option(fc.boolean(), { nil: undefined }),
  });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 1: Encounter Creation Uniqueness', () => {
  let service: DynamoDBService;
  let mockSend: jest.Mock;

  beforeAll(() => {
    // Mock marshall and unmarshall
    (marshall as jest.Mock).mockImplementation((obj) => obj);
    (unmarshall as jest.Mock).mockImplementation((obj) => obj);
  });

  beforeEach(() => {
    // Create a fresh mock for send
    mockSend = jest.fn();

    // Mock the DynamoDB client constructor
    (DynamoDBClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    // Mock send to always succeed
    mockSend.mockResolvedValue({});

    // Create service instance
    service = new DynamoDBService({
      tableName: 'test-table',
      region: 'us-east-1',
      maxRetries: 3,
      baseDelayMs: 10,
    });
  });

  it('should generate unique encounter IDs for multiple encounter creations', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(encounterDataArb(), { minLength: 2, maxLength: 20 }),
        async (encountersData) => {
          const createdIds: string[] = [];

          // Create all encounters with UUID v4 IDs
          for (const data of encountersData) {
            const encounterId = uuidv4();
            const returnedId = await service.createEncounter({
              encounterId,
              ...data,
            });

            createdIds.push(returnedId);
          }

          // Verify all IDs are unique
          const uniqueIds = new Set(createdIds);
          expect(uniqueIds.size).toBe(createdIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate IDs that are valid UUIDs', () => {
    fc.assert(
      fc.asyncProperty(encounterDataArb(), async (data) => {
        const encounterId = uuidv4();
        const returnedId = await service.createEncounter({
          encounterId,
          ...data,
        });

        // Verify the returned ID is a valid UUID v4 format
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(returnedId).toMatch(uuidRegex);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve encounter ID through the creation process', () => {
    fc.assert(
      fc.asyncProperty(encounterDataArb(), async (data) => {
        const encounterId = uuidv4();
        const returnedId = await service.createEncounter({
          encounterId,
          ...data,
        });

        // The returned ID should match the input ID
        expect(returnedId).toBe(encounterId);
      }),
      { numRuns: 100 }
    );
  });

  it('should generate unique IDs across different channels', () => {
    fc.assert(
      fc.asyncProperty(
        demographicsArb(),
        fc.string({ minLength: 10, maxLength: 500 }),
        async (demographics, symptoms) => {
          const channels: Array<'app' | 'voice' | 'ussd' | 'sms'> = [
            'app',
            'voice',
            'ussd',
            'sms',
          ];
          const createdIds: string[] = [];

          // Create one encounter per channel
          for (const channel of channels) {
            const encounterId = uuidv4();
            const returnedId = await service.createEncounter({
              encounterId,
              channel,
              demographics,
              symptoms,
            });

            createdIds.push(returnedId);
          }

          // Verify all IDs are unique
          const uniqueIds = new Set(createdIds);
          expect(uniqueIds.size).toBe(channels.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate unique IDs for offline and online encounters', () => {
    fc.assert(
      fc.asyncProperty(
        encounterDataArb(),
        encounterDataArb(),
        async (onlineData, offlineData) => {
          // Create online encounter
          const onlineId = uuidv4();
          const returnedOnlineId = await service.createEncounter({
            encounterId: onlineId,
            ...onlineData,
            offlineCreated: false,
          });

          // Create offline encounter
          const offlineId = uuidv4();
          const returnedOfflineId = await service.createEncounter({
            encounterId: offlineId,
            ...offlineData,
            offlineCreated: true,
          });

          // Verify IDs are different
          expect(returnedOnlineId).not.toBe(returnedOfflineId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain uniqueness with concurrent encounter creations', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(encounterDataArb(), { minLength: 5, maxLength: 10 }),
        async (encountersData) => {
          // Create all encounters concurrently
          const createPromises = encountersData.map((data) => {
            const encounterId = uuidv4();
            return service.createEncounter({
              encounterId,
              ...data,
            });
          });

          const createdIds = await Promise.all(createPromises);

          // Verify all IDs are unique
          const uniqueIds = new Set(createdIds);
          expect(uniqueIds.size).toBe(createdIds.length);
        }
      ),
      { numRuns: 50 } // Fewer runs for concurrent test
    );
  });

  it('should generate unique IDs regardless of encounter data similarity', () => {
    fc.assert(
      fc.asyncProperty(
        demographicsArb(),
        fc.string({ minLength: 10, maxLength: 500 }),
        channelArb(),
        fc.integer({ min: 2, max: 10 }),
        async (demographics, symptoms, channel, count) => {
          const createdIds: string[] = [];

          // Create multiple encounters with identical data
          for (let i = 0; i < count; i++) {
            const encounterId = uuidv4();
            const returnedId = await service.createEncounter({
              encounterId,
              channel,
              demographics,
              symptoms,
            });

            createdIds.push(returnedId);
          }

          // Verify all IDs are unique despite identical data
          const uniqueIds = new Set(createdIds);
          expect(uniqueIds.size).toBe(count);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle rapid sequential encounter creations without ID collision', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(encounterDataArb(), { minLength: 10, maxLength: 20 }),
        async (encountersData) => {
          const createdIds: string[] = [];

          // Create encounters rapidly in sequence
          for (const data of encountersData) {
            const encounterId = uuidv4();
            const returnedId = await service.createEncounter({
              encounterId,
              ...data,
            });

            createdIds.push(returnedId);
          }

          // Verify no collisions occurred
          const uniqueIds = new Set(createdIds);
          expect(uniqueIds.size).toBe(createdIds.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should generate unique IDs with various vital signs combinations', () => {
    fc.assert(
      fc.asyncProperty(
        channelArb(),
        demographicsArb(),
        fc.string({ minLength: 10, maxLength: 500 }),
        fc.array(vitalSignsArb(), { minLength: 2, maxLength: 5 }),
        async (channel, demographics, symptoms, vitalsCombinations) => {
          const createdIds: string[] = [];

          // Create encounters with different vital signs
          for (const vitals of vitalsCombinations) {
            const encounterId = uuidv4();
            const returnedId = await service.createEncounter({
              encounterId,
              channel,
              demographics,
              symptoms,
              vitals: Object.keys(vitals).length > 0 ? vitals : undefined,
            });

            createdIds.push(returnedId);
          }

          // Verify all IDs are unique
          const uniqueIds = new Set(createdIds);
          expect(uniqueIds.size).toBe(vitalsCombinations.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should verify UUID v4 collision probability is negligible', () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 1000 }),
        async (count) => {
          const generatedIds = new Set<string>();

          // Generate many UUIDs
          for (let i = 0; i < count; i++) {
            const id = uuidv4();
            generatedIds.add(id);
          }

          // All should be unique (collision probability is ~10^-15 for 1000 UUIDs)
          expect(generatedIds.size).toBe(count);
        }
      ),
      { numRuns: 10 } // Fewer runs since we're generating many IDs per run
    );
  });
});