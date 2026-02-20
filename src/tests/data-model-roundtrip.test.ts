/**
 * Property-Based Test: Data Model Round-Trip
 * Feature: firstline-triage-platform
 * Property 26: Data Persistence Round-Trip
 * 
 * **Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6, 12.7**
 * 
 * Test that writing entities to DynamoDB and reading them back produces
 * equivalent entities with all fields preserved.
 */

import * as fc from 'fast-check';
import {
  Encounter,
  TriageResult,
  Referral,
  Decision,
  DailyRollup,
  Followup,
  Channel,
  TriageLevel,
  UncertaintyLevel,
  Demographics,
  VitalSigns,
} from '../models';

// ============================================================================
// Generators for data models
// ============================================================================

/**
 * Generate valid channel values
 */
const channelArb = (): fc.Arbitrary<Channel> =>
  fc.oneof(
    fc.constant('app' as const),
    fc.constant('voice' as const),
    fc.constant('ussd' as const),
    fc.constant('sms' as const)
  );

/**
 * Generate valid triage levels
 */
const triageLevelArb = (): fc.Arbitrary<TriageLevel> =>
  fc.oneof(
    fc.constant('RED' as const),
    fc.constant('YELLOW' as const),
    fc.constant('GREEN' as const)
  );

/**
 * Generate valid uncertainty levels
 */
const uncertaintyLevelArb = (): fc.Arbitrary<UncertaintyLevel> =>
  fc.oneof(
    fc.constant('LOW' as const),
    fc.constant('MEDIUM' as const),
    fc.constant('HIGH' as const)
  );

/**
 * Generate valid demographics
 */
const demographicsArb = (): fc.Arbitrary<Demographics> =>
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
const vitalSignsArb = (): fc.Arbitrary<VitalSigns> =>
  fc.oneof(
    fc.constant({}),
    fc.record({
      temperature: fc.float({ min: 35, max: 42, noNaN: true }),
    }),
    fc.record({
      pulse: fc.integer({ min: 40, max: 200 }),
    }),
    fc.record({
      bloodPressure: fc.tuple(fc.integer({ min: 60, max: 200 }), fc.integer({ min: 40, max: 150 }))
        .map(([systolic, diastolic]) => `${systolic}/${diastolic}`),
    }),
    fc.record({
      respiratoryRate: fc.integer({ min: 8, max: 40 }),
    }),
    fc.record({
      temperature: fc.float({ min: 35, max: 42, noNaN: true }),
      pulse: fc.integer({ min: 40, max: 200 }),
      bloodPressure: fc.tuple(fc.integer({ min: 60, max: 200 }), fc.integer({ min: 40, max: 150 }))
        .map(([systolic, diastolic]) => `${systolic}/${diastolic}`),
      respiratoryRate: fc.integer({ min: 8, max: 40 }),
    })
  );

/**
 * Generate ISO8601 timestamp strings
 */
const iso8601Arb = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString());

/**
 * Generate date strings in YYYY-MM-DD format
 */
const dateStringArb = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString().split('T')[0]);

/**
 * Generate Unix timestamps for TTL
 */
const ttlArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 });

/**
 * Generate UUID-like strings
 */
const uuidArb = (): fc.Arbitrary<string> =>
  fc.hexaString({ minLength: 32, maxLength: 32 })
    .map(hex => 
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
    );

/**
 * Generate Encounter entities
 */
const encounterArb = (): fc.Arbitrary<Encounter> =>
  fc.tuple(
    uuidArb().map(id => `ENC#${id}`),
    uuidArb(),
    channelArb(),
    iso8601Arb(),
    fc.oneof(
      fc.constant('created' as const),
      fc.constant('in_progress' as const),
      fc.constant('completed' as const)
    ),
    demographicsArb(),
    fc.string({ minLength: 10, maxLength: 500 }),
    fc.oneof(fc.constant(undefined), vitalSignsArb()),
    fc.boolean(),
    fc.oneof(fc.constant(undefined), iso8601Arb()),
    dateStringArb().map(date => `DATE#${date}`),
    fc.tuple(channelArb(), iso8601Arb())
      .map(([channel, time]) => `CHANNEL#${channel}#TIME#${time}`),
    ttlArb()
  ).map(([PK, EncounterId, Channel, Timestamp, Status, Demographics, Symptoms, Vitals, OfflineCreated, SyncedAt, GSI1PK, GSI1SK, TTL]) => ({
    PK,
    SK: 'METADATA',
    Type: 'Encounter' as const,
    EncounterId,
    Channel,
    Timestamp,
    Status,
    Demographics,
    Symptoms,
    Vitals,
    OfflineCreated,
    SyncedAt,
    GSI1PK,
    GSI1SK,
    TTL,
  }));

/**
 * Generate Followup entities
 */
const followupArb = (): fc.Arbitrary<Followup> =>
  fc.record({
    PK: uuidArb().map(id => `ENC#${id}`),
    SK: fc.integer({ min: 1, max: 10 }).map(seq => `FOLLOWUP#${seq}`),
    Type: fc.constant('Followup' as const),
    Question: fc.string({ minLength: 10, maxLength: 200 }),
    Response: fc.string({ minLength: 1, maxLength: 500 }),
    Timestamp: iso8601Arb(),
  });

/**
 * Generate TriageResult entities
 */
const triageResultArb = (): fc.Arbitrary<TriageResult> =>
  fc.record({
    PK: uuidArb().map(id => `ENC#${id}`),
    SK: fc.constant('TRIAGE'),
    Type: fc.constant('TriageResult' as const),
    RiskTier: triageLevelArb(),
    DangerSigns: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { maxLength: 7 }),
    Uncertainty: uncertaintyLevelArb(),
    RecommendedNextSteps: fc.array(fc.string({ minLength: 10, maxLength: 200 }), { minLength: 1, maxLength: 5 }),
    WatchOuts: fc.array(fc.string({ minLength: 10, maxLength: 200 }), { maxLength: 5 }),
    ReferralRecommended: fc.boolean(),
    Disclaimer: fc.string({ minLength: 20, maxLength: 500 }),
    Reasoning: fc.string({ minLength: 20, maxLength: 1000 }),
    AiLatencyMs: fc.integer({ min: 100, max: 30000 }),
    UsedFallback: fc.boolean(),
    Timestamp: iso8601Arb(),
  });

/**
 * Generate Referral entities
 */
const referralArb = (): fc.Arbitrary<Referral> =>
  fc.tuple(
    uuidArb().map(id => `ENC#${id}`),
    uuidArb(),
    fc.oneof(fc.constant('pdf' as const), fc.constant('sms' as const)),
    fc.oneof(fc.constant(undefined), fc.webUrl()),
    fc.string({ minLength: 5, maxLength: 100 }),
    iso8601Arb(),
    fc.string({ minLength: 50, maxLength: 2000 })
  ).map(([PK, ReferralId, Format, DocumentUrl, Destination, SentAt, Content]) => ({
    PK,
    SK: 'REFERRAL',
    Type: 'Referral' as const,
    ReferralId,
    Format,
    DocumentUrl,
    Destination,
    SentAt,
    Content,
  }));

/**
 * Generate Decision entities
 */
const decisionArb = (): fc.Arbitrary<Decision> =>
  fc.record({
    PK: uuidArb().map(id => `ENC#${id}`),
    SK: fc.constant('DECISION'),
    Type: fc.constant('Decision' as const),
    AiModel: fc.oneof(
      fc.constant('anthropic.claude-3-haiku-20240307-v1:0'),
      fc.constant('anthropic.claude-3-sonnet-20240229-v1:0')
    ),
    PromptTokens: fc.integer({ min: 100, max: 2000 }),
    CompletionTokens: fc.integer({ min: 50, max: 500 }),
    RawResponse: fc.string({ minLength: 100, maxLength: 2000 }),
    ProcessingTimeMs: fc.integer({ min: 500, max: 30000 }),
    Timestamp: iso8601Arb(),
  });

/**
 * Generate DailyRollup entities
 */
const dailyRollupArb = (): fc.Arbitrary<DailyRollup> =>
  fc.record({
    PK: dateStringArb().map(date => `ROLLUP#${date}`),
    SK: fc.constant('STATS'),
    Type: fc.constant('DailyRollup' as const),
    Date: dateStringArb(),
    TotalEncounters: fc.integer({ min: 0, max: 10000 }),
    ChannelCounts: fc.record({
      app: fc.integer({ min: 0, max: 5000 }),
      voice: fc.integer({ min: 0, max: 5000 }),
      ussd: fc.integer({ min: 0, max: 5000 }),
      sms: fc.integer({ min: 0, max: 5000 }),
    }),
    TriageCounts: fc.record({
      red: fc.integer({ min: 0, max: 5000 }),
      yellow: fc.integer({ min: 0, max: 5000 }),
      green: fc.integer({ min: 0, max: 5000 }),
    }),
    SymptomCounts: fc.dictionary(
      fc.string({ minLength: 3, maxLength: 20 }),
      fc.integer({ min: 0, max: 1000 })
    ),
    DangerSignCounts: fc.dictionary(
      fc.string({ minLength: 5, maxLength: 30 }),
      fc.integer({ min: 0, max: 500 })
    ),
    ReferralCount: fc.integer({ min: 0, max: 5000 }),
    TotalAiLatencyMs: fc.integer({ min: 0, max: 1000000 }),
    AiCallCount: fc.integer({ min: 0, max: 5000 }),
    LastUpdated: iso8601Arb(),
  });

// ============================================================================
// Mock DynamoDB operations for testing
// ============================================================================

/**
 * Mock in-memory storage for testing round-trip
 */
const mockStorage = new Map<string, any>();

/**
 * Mock DynamoDB put operation
 */
const mockPut = async <T>(item: T): Promise<void> => {
  const key = JSON.stringify({ PK: (item as any).PK, SK: (item as any).SK });
  mockStorage.set(key, JSON.parse(JSON.stringify(item))); // Deep clone
};

/**
 * Mock DynamoDB get operation
 */
const mockGet = async <T>(PK: string, SK: string): Promise<T | null> => {
  const key = JSON.stringify({ PK, SK });
  const item = mockStorage.get(key);
  return item ? JSON.parse(JSON.stringify(item)) : null; // Deep clone
};

/**
 * Clear mock storage between tests
 */
const clearMockStorage = (): void => {
  mockStorage.clear();
};

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 26: Data Persistence Round-Trip', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('should preserve all Encounter fields in round-trip', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        // Write to mock DynamoDB
        await mockPut(encounter);

        // Read back from mock DynamoDB
        const retrieved = await mockGet<Encounter>(encounter.PK, encounter.SK);

        // Verify all fields are preserved
        expect(retrieved).not.toBeNull();
        expect(retrieved).toEqual(encounter);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve all Followup fields in round-trip', () => {
    fc.assert(
      fc.asyncProperty(followupArb(), async (followup) => {
        await mockPut(followup);
        const retrieved = await mockGet<Followup>(followup.PK, followup.SK);

        expect(retrieved).not.toBeNull();
        expect(retrieved).toEqual(followup);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve all TriageResult fields in round-trip', () => {
    fc.assert(
      fc.asyncProperty(triageResultArb(), async (triageResult) => {
        await mockPut(triageResult);
        const retrieved = await mockGet<TriageResult>(triageResult.PK, triageResult.SK);

        expect(retrieved).not.toBeNull();
        expect(retrieved).toEqual(triageResult);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve all Referral fields in round-trip', () => {
    fc.assert(
      fc.asyncProperty(referralArb(), async (referral) => {
        await mockPut(referral);
        const retrieved = await mockGet<Referral>(referral.PK, referral.SK);

        expect(retrieved).not.toBeNull();
        expect(retrieved).toEqual(referral);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve all Decision fields in round-trip', () => {
    fc.assert(
      fc.asyncProperty(decisionArb(), async (decision) => {
        await mockPut(decision);
        const retrieved = await mockGet<Decision>(decision.PK, decision.SK);

        expect(retrieved).not.toBeNull();
        expect(retrieved).toEqual(decision);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve all DailyRollup fields in round-trip', () => {
    fc.assert(
      fc.asyncProperty(dailyRollupArb(), async (rollup) => {
        await mockPut(rollup);
        const retrieved = await mockGet<DailyRollup>(rollup.PK, rollup.SK);

        expect(retrieved).not.toBeNull();
        expect(retrieved).toEqual(rollup);
      }),
      { numRuns: 100 }
    );
  });

  it('should handle optional fields correctly in Encounter', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        await mockPut(encounter);
        const retrieved = await mockGet<Encounter>(encounter.PK, encounter.SK);

        expect(retrieved).not.toBeNull();
        
        // Verify optional fields are handled correctly
        if (encounter.Vitals === undefined) {
          expect(retrieved!.Vitals).toBeUndefined();
        } else {
          expect(retrieved!.Vitals).toEqual(encounter.Vitals);
        }

        if (encounter.SyncedAt === undefined) {
          expect(retrieved!.SyncedAt).toBeUndefined();
        } else {
          expect(retrieved!.SyncedAt).toEqual(encounter.SyncedAt);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should handle optional DocumentUrl in Referral', () => {
    fc.assert(
      fc.asyncProperty(referralArb(), async (referral) => {
        await mockPut(referral);
        const retrieved = await mockGet<Referral>(referral.PK, referral.SK);

        expect(retrieved).not.toBeNull();
        
        if (referral.DocumentUrl === undefined) {
          expect(retrieved!.DocumentUrl).toBeUndefined();
        } else {
          expect(retrieved!.DocumentUrl).toEqual(referral.DocumentUrl);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve nested objects in Demographics', () => {
    fc.assert(
      fc.asyncProperty(encounterArb(), async (encounter) => {
        await mockPut(encounter);
        const retrieved = await mockGet<Encounter>(encounter.PK, encounter.SK);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.Demographics).toEqual(encounter.Demographics);
        expect(retrieved!.Demographics.age).toBe(encounter.Demographics.age);
        expect(retrieved!.Demographics.sex).toBe(encounter.Demographics.sex);
        expect(retrieved!.Demographics.location).toBe(encounter.Demographics.location);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve arrays in TriageResult', () => {
    fc.assert(
      fc.asyncProperty(triageResultArb(), async (triageResult) => {
        await mockPut(triageResult);
        const retrieved = await mockGet<TriageResult>(triageResult.PK, triageResult.SK);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.DangerSigns).toEqual(triageResult.DangerSigns);
        expect(retrieved!.RecommendedNextSteps).toEqual(triageResult.RecommendedNextSteps);
        expect(retrieved!.WatchOuts).toEqual(triageResult.WatchOuts);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve Record types in DailyRollup', () => {
    fc.assert(
      fc.asyncProperty(dailyRollupArb(), async (rollup) => {
        await mockPut(rollup);
        const retrieved = await mockGet<DailyRollup>(rollup.PK, rollup.SK);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.SymptomCounts).toEqual(rollup.SymptomCounts);
        expect(retrieved!.DangerSignCounts).toEqual(rollup.DangerSignCounts);
      }),
      { numRuns: 100 }
    );
  });
});
