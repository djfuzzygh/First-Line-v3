/**
 * Property-Based Test: Dashboard Data Structure
 * 
 * Property 29: Dashboard Data Structure
 * 
 * For any dashboard statistics query, the response should include all required
 * fields: totalEncounters, channelDistribution, triageBreakdown, topSymptoms,
 * dangerSignFrequency, referralRate, and avgAiLatency.
 * 
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7**
 * 
 * Feature: firstline-triage-platform, Property 29: Dashboard Data Structure
 */

import * as fc from 'fast-check';
import { RollupService, DashboardStats } from '../services/rollup.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { DailyRollup } from '../models';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';

describe('Property 29: Dashboard Data Structure', () => {
  let rollupService: RollupService;
  let dynamoDBService: DynamoDBService;
  const dynamoMock = mockClient(DynamoDBClient);

  beforeEach(() => {
    dynamoMock.reset();
    
    dynamoDBService = new DynamoDBService({ 
      tableName: 'test-table', 
      region: 'us-east-1' 
    });
    
    rollupService = new RollupService({
      dynamoDBService,
      region: 'us-east-1',
    });
  });

  /**
   * Generator for daily rollup data
   * Note: ReferralCount is constrained to be <= TotalEncounters to ensure valid data
   */
  const dailyRollupArbitrary = fc.integer({ min: 0, max: 10000 }).chain(totalEncounters =>
    fc.record({
      PK: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
        .map(d => `ROLLUP#${d.toISOString().split('T')[0]}`),
      SK: fc.constant('STATS'),
      Type: fc.constant('DailyRollup' as const),
      Date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
        .map(d => d.toISOString().split('T')[0]),
      TotalEncounters: fc.constant(totalEncounters),
      ChannelCounts: fc.record({
        app: fc.integer({ min: 0, max: 5000 }),
        voice: fc.integer({ min: 0, max: 5000 }),
        ussd: fc.integer({ min: 0, max: 5000 }),
        sms: fc.integer({ min: 0, max: 5000 }),
      }),
      TriageCounts: fc.record({
        red: fc.integer({ min: 0, max: 3000 }),
        yellow: fc.integer({ min: 0, max: 3000 }),
        green: fc.integer({ min: 0, max: 3000 }),
      }),
      SymptomCounts: fc.dictionary(
        fc.constantFrom('respiratory', 'gastrointestinal', 'neurological', 'cardiovascular', 'fever', 'pain', 'other'),
        fc.integer({ min: 0, max: 1000 }),
        { minKeys: 0, maxKeys: 7 }
      ),
      DangerSignCounts: fc.dictionary(
        fc.constantFrom(
          'unconscious',
          'seizure',
          'severe breathing difficulty',
          'heavy bleeding',
          'severe chest pain',
          'severe abdominal pain',
          'pregnancy bleeding'
        ),
        fc.integer({ min: 0, max: 500 }),
        { minKeys: 0, maxKeys: 7 }
      ),
      // Ensure referral count doesn't exceed total encounters
      ReferralCount: fc.integer({ min: 0, max: Math.max(0, totalEncounters) }),
      TotalAiLatencyMs: fc.integer({ min: 0, max: 10000000 }),
      AiCallCount: fc.integer({ min: 0, max: 10000 }),
      LastUpdated: fc.date().map(d => d.toISOString()),
    }) as fc.Arbitrary<DailyRollup>
  );

  it('should return dashboard stats with all required fields for any rollup data', async () => {
    await fc.assert(
      fc.asyncProperty(
        dailyRollupArbitrary,
        async (rollupData) => {
          // Mock DynamoDB get to return the rollup data
          dynamoMock.on(GetItemCommand).resolves({
            Item: marshall(rollupData),
          });

          // Act: Get dashboard stats
          const stats = await rollupService.getDashboardStats(rollupData.Date);

          // Property 29: Dashboard Data Structure
          // For any dashboard statistics query, the response should include all required fields

          // Assert: Response is defined
          expect(stats).toBeDefined();
          expect(stats).not.toBeNull();

          // Requirement 13.1: Display total encounters today
          expect(stats).toHaveProperty('totalEncounters');
          expect(typeof stats.totalEncounters).toBe('number');
          expect(stats.totalEncounters).toBeGreaterThanOrEqual(0);
          expect(stats.totalEncounters).toBe(rollupData.TotalEncounters);

          // Requirement 13.2: Show channel distribution
          expect(stats).toHaveProperty('channelDistribution');
          expect(stats.channelDistribution).toBeDefined();
          expect(typeof stats.channelDistribution).toBe('object');
          
          // Channel distribution must have all four channels
          expect(stats.channelDistribution).toHaveProperty('app');
          expect(stats.channelDistribution).toHaveProperty('voice');
          expect(stats.channelDistribution).toHaveProperty('ussd');
          expect(stats.channelDistribution).toHaveProperty('sms');
          
          // All channel counts must be numbers >= 0
          expect(typeof stats.channelDistribution.app).toBe('number');
          expect(typeof stats.channelDistribution.voice).toBe('number');
          expect(typeof stats.channelDistribution.ussd).toBe('number');
          expect(typeof stats.channelDistribution.sms).toBe('number');
          expect(stats.channelDistribution.app).toBeGreaterThanOrEqual(0);
          expect(stats.channelDistribution.voice).toBeGreaterThanOrEqual(0);
          expect(stats.channelDistribution.ussd).toBeGreaterThanOrEqual(0);
          expect(stats.channelDistribution.sms).toBeGreaterThanOrEqual(0);

          // Requirement 13.3: Display RED, YELLOW, and GREEN triage level breakdown
          expect(stats).toHaveProperty('triageBreakdown');
          expect(stats.triageBreakdown).toBeDefined();
          expect(typeof stats.triageBreakdown).toBe('object');
          
          // Triage breakdown must have all three levels
          expect(stats.triageBreakdown).toHaveProperty('red');
          expect(stats.triageBreakdown).toHaveProperty('yellow');
          expect(stats.triageBreakdown).toHaveProperty('green');
          
          // All triage counts must be numbers >= 0
          expect(typeof stats.triageBreakdown.red).toBe('number');
          expect(typeof stats.triageBreakdown.yellow).toBe('number');
          expect(typeof stats.triageBreakdown.green).toBe('number');
          expect(stats.triageBreakdown.red).toBeGreaterThanOrEqual(0);
          expect(stats.triageBreakdown.yellow).toBeGreaterThanOrEqual(0);
          expect(stats.triageBreakdown.green).toBeGreaterThanOrEqual(0);

          // Requirement 13.4: Show top symptom categories reported
          expect(stats).toHaveProperty('topSymptoms');
          expect(Array.isArray(stats.topSymptoms)).toBe(true);
          
          // Each symptom entry must have symptom name and count
          stats.topSymptoms.forEach(symptomEntry => {
            expect(symptomEntry).toHaveProperty('symptom');
            expect(symptomEntry).toHaveProperty('count');
            expect(typeof symptomEntry.symptom).toBe('string');
            expect(typeof symptomEntry.count).toBe('number');
            // Note: Count can be 0 if symptom category was tracked but hasn't occurred
            expect(symptomEntry.count).toBeGreaterThanOrEqual(0);
          });
          
          // Top symptoms should be sorted by count (descending)
          for (let i = 0; i < stats.topSymptoms.length - 1; i++) {
            expect(stats.topSymptoms[i].count).toBeGreaterThanOrEqual(stats.topSymptoms[i + 1].count);
          }
          
          // Top symptoms should be limited to 5 or fewer
          expect(stats.topSymptoms.length).toBeLessThanOrEqual(5);

          // Requirement 13.5: Display danger sign frequency
          expect(stats).toHaveProperty('dangerSignFrequency');
          expect(typeof stats.dangerSignFrequency).toBe('object');
          
          // Danger sign frequency is a record/dictionary
          // Note: Counts can be 0 if the danger sign was tracked but hasn't occurred
          Object.entries(stats.dangerSignFrequency).forEach(([sign, count]) => {
            expect(typeof sign).toBe('string');
            expect(typeof count).toBe('number');
            expect(count).toBeGreaterThanOrEqual(0);
          });

          // Requirement 13.6: Show referral rate percentage
          expect(stats).toHaveProperty('referralRate');
          expect(typeof stats.referralRate).toBe('number');
          expect(stats.referralRate).toBeGreaterThanOrEqual(0);
          expect(stats.referralRate).toBeLessThanOrEqual(100);
          
          // Referral rate should be calculated correctly
          if (rollupData.TotalEncounters > 0) {
            const expectedRate = (rollupData.ReferralCount / rollupData.TotalEncounters) * 100;
            const roundedExpected = Math.round(expectedRate * 100) / 100;
            expect(stats.referralRate).toBe(roundedExpected);
          } else {
            expect(stats.referralRate).toBe(0);
          }

          // Requirement 13.7: Display AI Engine average latency
          expect(stats).toHaveProperty('avgAiLatency');
          expect(typeof stats.avgAiLatency).toBe('number');
          expect(stats.avgAiLatency).toBeGreaterThanOrEqual(0);
          
          // Average AI latency should be calculated correctly
          if (rollupData.AiCallCount > 0) {
            const expectedAvg = rollupData.TotalAiLatencyMs / rollupData.AiCallCount;
            const roundedExpected = Math.round(expectedAvg);
            expect(stats.avgAiLatency).toBe(roundedExpected);
          } else {
            expect(stats.avgAiLatency).toBe(0);
          }

          // Assert: Date field is included
          expect(stats).toHaveProperty('date');
          expect(typeof stats.date).toBe('string');
          expect(stats.date).toBe(rollupData.Date);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should return empty dashboard stats with correct structure when no data exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
          .map(d => d.toISOString().split('T')[0]),
        async (date) => {
          // Mock DynamoDB get to return no data
          dynamoMock.on(GetItemCommand).resolves({
            Item: undefined,
          });

          // Act: Get dashboard stats for date with no data
          const stats = await rollupService.getDashboardStats(date);

          // Assert: Response has correct structure even with no data
          expect(stats).toBeDefined();
          expect(stats.date).toBe(date);
          
          // All required fields should be present with zero/empty values
          expect(stats.totalEncounters).toBe(0);
          
          expect(stats.channelDistribution).toEqual({
            app: 0,
            voice: 0,
            ussd: 0,
            sms: 0,
          });
          
          expect(stats.triageBreakdown).toEqual({
            red: 0,
            yellow: 0,
            green: 0,
          });
          
          expect(stats.topSymptoms).toEqual([]);
          expect(stats.dangerSignFrequency).toEqual({});
          expect(stats.referralRate).toBe(0);
          expect(stats.avgAiLatency).toBe(0);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should handle edge cases in metric calculations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
            .map(d => d.toISOString().split('T')[0]),
          totalEncounters: fc.constantFrom(0, 1, 100),
          totalAiLatencyMs: fc.integer({ min: 0, max: 100000 }),
          aiCallCount: fc.constantFrom(0, 1, 50),
        }).chain(({ date, totalEncounters, totalAiLatencyMs, aiCallCount }) =>
          fc.record({
            date: fc.constant(date),
            totalEncounters: fc.constant(totalEncounters),
            // Ensure referral count doesn't exceed total encounters
            referralCount: fc.integer({ min: 0, max: Math.max(0, totalEncounters) }),
            totalAiLatencyMs: fc.constant(totalAiLatencyMs),
            aiCallCount: fc.constant(aiCallCount),
          })
        ),
        async ({ date, totalEncounters, referralCount, totalAiLatencyMs, aiCallCount }) => {
          // Create rollup data with edge case values
          const rollupData: DailyRollup = {
            PK: `ROLLUP#${date}`,
            SK: 'STATS',
            Type: 'DailyRollup',
            Date: date,
            TotalEncounters: totalEncounters,
            ChannelCounts: { app: 0, voice: 0, ussd: 0, sms: 0 },
            TriageCounts: { red: 0, yellow: 0, green: 0 },
            SymptomCounts: {},
            DangerSignCounts: {},
            ReferralCount: referralCount,
            TotalAiLatencyMs: totalAiLatencyMs,
            AiCallCount: aiCallCount,
            LastUpdated: new Date().toISOString(),
          };

          // Mock DynamoDB get
          dynamoMock.on(GetItemCommand).resolves({
            Item: marshall(rollupData),
          });

          // Act: Get dashboard stats
          const stats = await rollupService.getDashboardStats(date);

          // Assert: Referral rate handles division by zero
          if (totalEncounters === 0) {
            expect(stats.referralRate).toBe(0);
          } else {
            expect(stats.referralRate).toBeGreaterThanOrEqual(0);
            expect(stats.referralRate).toBeLessThanOrEqual(100);
          }

          // Assert: Average AI latency handles division by zero
          if (aiCallCount === 0) {
            expect(stats.avgAiLatency).toBe(0);
          } else {
            expect(stats.avgAiLatency).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(stats.avgAiLatency)).toBe(true);
          }

          // Assert: All fields are present and valid
          expect(stats.totalEncounters).toBe(totalEncounters);
          expect(typeof stats.referralRate).toBe('number');
          expect(typeof stats.avgAiLatency).toBe('number');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should maintain data structure consistency across different dates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dailyRollupArbitrary, { minLength: 2, maxLength: 5 }),
        async (rollupDataArray) => {
          // Test that dashboard stats have consistent structure across different dates
          const allStats: DashboardStats[] = [];

          for (const rollupData of rollupDataArray) {
            // Mock DynamoDB get for each date
            dynamoMock.on(GetItemCommand).resolves({
              Item: marshall(rollupData),
            });

            const stats = await rollupService.getDashboardStats(rollupData.Date);
            allStats.push(stats);
          }

          // Assert: All stats have the same structure
          const firstStats = allStats[0];
          const expectedKeys = Object.keys(firstStats).sort();

          for (const stats of allStats) {
            const actualKeys = Object.keys(stats).sort();
            expect(actualKeys).toEqual(expectedKeys);

            // Assert: All nested objects have consistent structure
            expect(Object.keys(stats.channelDistribution).sort()).toEqual(['app', 'sms', 'ussd', 'voice']);
            expect(Object.keys(stats.triageBreakdown).sort()).toEqual(['green', 'red', 'yellow']);
          }
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  }, 35000);
});
