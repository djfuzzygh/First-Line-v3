/**
 * Property-Based Test: Atomic Rollup Updates
 * 
 * Property 27: Atomic Rollup Updates
 * 
 * For any completed encounter, the daily rollup statistics should be updated
 * atomically to reflect the new encounter, channel, triage level, and symptoms.
 * 
 * **Validates: Requirements 12.8**
 * 
 * Feature: firstline-triage-platform, Property 27: Atomic Rollup Updates
 */

import * as fc from 'fast-check';
import { RollupService, RollupUpdateData } from '../services/rollup.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { Channel, TriageLevel } from '../models';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { unmarshall } from '@aws-sdk/util-dynamodb';

describe('Property 27: Atomic Rollup Updates', () => {
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
   * Generator for rollup update data
   */
  const rollupUpdateDataArbitrary = fc.record({
    date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
      .map(d => d.toISOString().split('T')[0]),
    channel: fc.constantFrom('app', 'voice', 'ussd', 'sms') as fc.Arbitrary<Channel>,
    triageLevel: fc.constantFrom('RED', 'YELLOW', 'GREEN') as fc.Arbitrary<TriageLevel>,
    symptoms: fc.oneof(
      fc.constant('I have a cough and fever'),
      fc.constant('I have severe chest pain'),
      fc.constant('I have stomach pain and vomiting'),
      fc.constant('I have a headache and dizziness'),
      fc.constant('I have breathing difficulty'),
      fc.constant('I have abdominal pain')
    ),
    dangerSigns: fc.option(
      fc.array(
        fc.constantFrom(
          'unconscious',
          'seizure',
          'severe breathing difficulty',
          'heavy bleeding',
          'severe chest pain',
          'severe abdominal pain',
          'pregnancy bleeding'
        ),
        { minLength: 0, maxLength: 3 }
      ),
      { nil: undefined }
    ),
    hasReferral: fc.boolean(),
    aiLatencyMs: fc.integer({ min: 100, max: 5000 }),
  }) as fc.Arbitrary<RollupUpdateData>;

  it('should update rollup statistics atomically for any completed encounter', async () => {
    await fc.assert(
      fc.asyncProperty(
        rollupUpdateDataArbitrary,
        async (updateData) => {
          // Track the update command sent to DynamoDB
          let updateCommand: any = null;

          // Mock DynamoDB update to capture the command
          dynamoMock.on(UpdateItemCommand).callsFake((input) => {
            updateCommand = input;
            return Promise.resolve({});
          });

          // Act: Update rollup
          await rollupService.updateRollup(updateData);

          // Assert: Update command was sent (Requirement 12.8)
          expect(updateCommand).not.toBeNull();
          expect(updateCommand).toBeDefined();

          // Assert: Update uses correct table
          expect(updateCommand.TableName).toBe('test-table');

          // Assert: Update targets correct rollup entity
          const key = unmarshall(updateCommand.Key);
          expect(key.PK).toBe(`ROLLUP#${updateData.date}`);
          expect(key.SK).toBe('STATS');

          // Assert: Update expression exists
          expect(updateCommand.UpdateExpression).toBeDefined();
          expect(typeof updateCommand.UpdateExpression).toBe('string');

          // Assert: Update expression uses SET (atomic operations)
          expect(updateCommand.UpdateExpression).toContain('SET');

          // Assert: Update increments total encounters atomically
          expect(updateCommand.UpdateExpression).toContain('TotalEncounters');
          expect(updateCommand.UpdateExpression).toContain('if_not_exists');

          // Assert: Update increments channel count atomically
          expect(updateCommand.UpdateExpression).toContain('ChannelCounts');
          
          // Assert: Update increments triage level count atomically
          expect(updateCommand.UpdateExpression).toContain('TriageCounts');

          // Assert: Update increments symptom count atomically
          expect(updateCommand.UpdateExpression).toContain('SymptomCounts');

          // Assert: Update increments AI latency atomically
          expect(updateCommand.UpdateExpression).toContain('TotalAiLatencyMs');
          expect(updateCommand.UpdateExpression).toContain('AiCallCount');

          // Assert: If referral exists, referral count is incremented
          if (updateData.hasReferral) {
            expect(updateCommand.UpdateExpression).toContain('ReferralCount');
          }

          // Assert: If danger signs exist, danger sign counts are incremented
          if (updateData.dangerSigns && updateData.dangerSigns.length > 0) {
            expect(updateCommand.UpdateExpression).toContain('DangerSignCounts');
          }

          // Assert: Update sets metadata fields
          expect(updateCommand.UpdateExpression).toContain('LastUpdated');
          expect(updateCommand.UpdateExpression).toContain('#type');
          expect(updateCommand.UpdateExpression).toContain('#date');

          // Assert: Expression attribute values contain required values
          const values = unmarshall(updateCommand.ExpressionAttributeValues);
          expect(values[':one']).toBe(1);
          expect(values[':zero']).toBe(0);
          expect(values[':latency']).toBe(updateData.aiLatencyMs);
          expect(values[':now']).toBeDefined();
          expect(values[':type']).toBe('DailyRollup');
          expect(values[':date']).toBe(updateData.date);

          // Assert: Expression attribute names map special characters
          expect(updateCommand.ExpressionAttributeNames).toBeDefined();
          expect(updateCommand.ExpressionAttributeNames['#type']).toBe('Type');
          expect(updateCommand.ExpressionAttributeNames['#date']).toBe('Date');

          // Assert: Channel is mapped in attribute names
          const channelKey = `#channel_${updateData.channel}`;
          expect(updateCommand.ExpressionAttributeNames[channelKey]).toBe(updateData.channel);

          // Assert: Triage level is mapped in attribute names
          const triageKey = `#triage_${updateData.triageLevel.toLowerCase()}`;
          expect(updateCommand.ExpressionAttributeNames[triageKey]).toBe(updateData.triageLevel.toLowerCase());
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should handle concurrent updates to the same rollup without data loss', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(rollupUpdateDataArbitrary, { minLength: 2, maxLength: 5 }),
        async (updates) => {
          // Ensure all updates are for the same date to test concurrency
          const commonDate = updates[0].date;
          const sameDataUpdates = updates.map(u => ({ ...u, date: commonDate }));

          // Track all update commands
          const updateCommands: any[] = [];

          // Mock DynamoDB update to capture all commands
          dynamoMock.on(UpdateItemCommand).callsFake((input) => {
            updateCommands.push(input);
            return Promise.resolve({});
          });

          // Act: Execute all updates concurrently
          await Promise.all(
            sameDataUpdates.map(update => rollupService.updateRollup(update))
          );

          // Assert: All updates were executed
          expect(updateCommands.length).toBe(sameDataUpdates.length);

          // Assert: All updates target the same rollup entity
          for (const cmd of updateCommands) {
            const key = unmarshall(cmd.Key);
            expect(key.PK).toBe(`ROLLUP#${commonDate}`);
            expect(key.SK).toBe('STATS');
          }

          // Assert: All updates use atomic operations (if_not_exists)
          for (const cmd of updateCommands) {
            expect(cmd.UpdateExpression).toContain('if_not_exists');
            expect(cmd.UpdateExpression).toContain('TotalEncounters');
          }

          // Assert: Each update increments by 1 (not overwriting)
          for (const cmd of updateCommands) {
            const values = unmarshall(cmd.ExpressionAttributeValues);
            expect(values[':one']).toBe(1);
          }
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  }, 35000);

  it('should correctly categorize symptoms and update symptom counts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          date: fc.constant('2024-06-15'),
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms') as fc.Arbitrary<Channel>,
          triageLevel: fc.constantFrom('RED', 'YELLOW', 'GREEN') as fc.Arbitrary<TriageLevel>,
          symptoms: fc.constantFrom(
            'I have a cough',
            'I have stomach pain',
            'I have a headache',
            'I have chest pain',
            'I have a fever',
            'I have pain in my leg'
          ),
          dangerSigns: fc.constant(undefined),
          hasReferral: fc.boolean(),
          aiLatencyMs: fc.integer({ min: 100, max: 5000 }),
        }) as fc.Arbitrary<RollupUpdateData>,
        async (updateData) => {
          // Track the update command
          let updateCommand: any = null;

          dynamoMock.on(UpdateItemCommand).callsFake((input) => {
            updateCommand = input;
            return Promise.resolve({});
          });

          // Act: Update rollup
          await rollupService.updateRollup(updateData);

          // Assert: Symptom was categorized
          expect(updateCommand.UpdateExpression).toContain('SymptomCounts');

          // Determine expected category based on RollupService logic
          // Note: Order matters - more general patterns are checked first
          let expectedCategory: string;
          const lowerSymptoms = updateData.symptoms.toLowerCase();
          
          // Respiratory (includes chest pain per design doc)
          if (lowerSymptoms.includes('cough') || lowerSymptoms.includes('chest')) {
            expectedCategory = 'respiratory';
          } else if (lowerSymptoms.includes('stomach')) {
            expectedCategory = 'gastrointestinal';
          } else if (lowerSymptoms.includes('headache')) {
            expectedCategory = 'neurological';
          } else if (lowerSymptoms.includes('fever')) {
            expectedCategory = 'fever';
          } else if (lowerSymptoms.includes('pain')) {
            expectedCategory = 'pain';
          } else {
            expectedCategory = 'other';
          }

          // Assert: Correct symptom category is in attribute names
          const symptomKey = `#symptom_${expectedCategory}`;
          expect(updateCommand.ExpressionAttributeNames[symptomKey]).toBe(expectedCategory);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should preserve all rollup fields across updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        rollupUpdateDataArbitrary,
        async (updateData) => {
          // Track the update command
          let updateCommand: any = null;

          dynamoMock.on(UpdateItemCommand).callsFake((input) => {
            updateCommand = input;
            return Promise.resolve({});
          });

          // Act: Update rollup
          await rollupService.updateRollup(updateData);

          // Assert: All required fields are updated
          const updateExpr = updateCommand.UpdateExpression;
          
          // Core counters
          expect(updateExpr).toContain('TotalEncounters');
          expect(updateExpr).toContain('ChannelCounts');
          expect(updateExpr).toContain('TriageCounts');
          expect(updateExpr).toContain('SymptomCounts');
          expect(updateExpr).toContain('TotalAiLatencyMs');
          expect(updateExpr).toContain('AiCallCount');
          
          // Metadata
          expect(updateExpr).toContain('LastUpdated');
          expect(updateExpr).toContain('#type');
          expect(updateExpr).toContain('#date');

          // Assert: Update uses if_not_exists to preserve existing data
          expect(updateExpr).toContain('if_not_exists');

          // Assert: Update adds to existing values (doesn't overwrite)
          expect(updateExpr).toMatch(/\+ :one/);
          expect(updateExpr).toMatch(/\+ :latency/);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
