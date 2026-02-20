/**
 * Property-Based Test: DynamoDB Retry Logic
 * Feature: firstline-triage-platform
 * Property 36: DynamoDB Retry Logic
 * 
 * **Validates: Requirements 17.3, 17.4**
 * 
 * Test that DynamoDB operations retry up to 3 times with exponential backoff
 * before failing.
 */

import * as fc from 'fast-check';
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
 * Generate arbitrary DynamoDB items
 */
const dynamoItemArb = (): fc.Arbitrary<Record<string, any>> =>
  fc.record({
    PK: fc.string({ minLength: 5, maxLength: 50 }),
    SK: fc.string({ minLength: 5, maxLength: 50 }),
    Type: fc.oneof(
      fc.constant('Encounter'),
      fc.constant('TriageResult'),
      fc.constant('Referral'),
      fc.constant('Decision'),
      fc.constant('DailyRollup'),
      fc.constant('Followup')
    ),
    Data: fc.string({ minLength: 10, maxLength: 200 }),
  });

/**
 * Generate number of failures before success (0 to 3)
 */
const failureCountArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 3 });

/**
 * Generate error types that should trigger retries
 */
const retryableErrorArb = (): fc.Arbitrary<Error> =>
  fc.oneof(
    fc.constant(new Error('Network error')),
    fc.constant(new Error('Timeout')),
    fc.constant(new Error('Service unavailable')),
    fc.constant(new Error('Throttling exception')),
    fc.constant(new Error('Internal server error'))
  );

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 36: DynamoDB Retry Logic', () => {
  let service: DynamoDBService;
  let mockSend: jest.Mock;

  beforeAll(() => {
    // Mock marshall and unmarshall once for all tests
    (marshall as jest.Mock).mockImplementation((obj) => obj);
    (unmarshall as jest.Mock).mockImplementation((obj) => obj);
  });

  // Helper to create a fresh service and mock for each test
  const setupTest = () => {
    // Create a fresh mock for send
    mockSend = jest.fn();
    
    // Mock the DynamoDB client constructor to return our mock
    (DynamoDBClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    // Create a new service instance with the mocked client
    service = new DynamoDBService({
      tableName: 'test-table',
      region: 'us-east-1',
      maxRetries: 3,
      baseDelayMs: 10, // Use small delay for tests
    });
    
    return mockSend;
  };

  it('should retry put operations up to 3 times before failing', () => {
    fc.assert(
      fc.asyncProperty(
        dynamoItemArb(),
        failureCountArb(),
        retryableErrorArb(),
        async (item, failureCount, error) => {
          // Setup fresh mock for each property test run
          const mock = setupTest();
          
          // Setup mock to fail failureCount times, then succeed
          if (failureCount < 3) {
            // Should succeed after retries
            for (let i = 0; i < failureCount; i++) {
              mock.mockRejectedValueOnce(error);
            }
            mock.mockResolvedValueOnce({});

            await service.put(item);

            // Verify it was called failureCount + 1 times (failures + success)
            expect(mock).toHaveBeenCalledTimes(failureCount + 1);
          } else {
            // Should fail after 3 attempts
            mock.mockRejectedValue(error);

            await expect(service.put(item)).rejects.toThrow(
              'DynamoDB operation failed after 3 attempts'
            );

            // Verify it was called exactly 3 times
            expect(mock).toHaveBeenCalledTimes(3);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retry get operations up to 3 times before failing', () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        failureCountArb(),
        retryableErrorArb(),
        async (pk, sk, failureCount, error) => {
          // Setup fresh mock and service for each property test run
          const mock = setupTest();
          
          if (failureCount < 3) {
            // Should succeed after retries
            for (let i = 0; i < failureCount; i++) {
              mock.mockRejectedValueOnce(error);
            }
            mock.mockResolvedValueOnce({ Item: { PK: pk, SK: sk } });

            const result = await service.get(pk, sk);

            expect(result).toEqual({ PK: pk, SK: sk });
            expect(mock).toHaveBeenCalledTimes(failureCount + 1);
          } else {
            // Should fail after 3 attempts
            mock.mockRejectedValue(error);

            await expect(service.get(pk, sk)).rejects.toThrow(
              'DynamoDB operation failed after 3 attempts'
            );

            expect(mock).toHaveBeenCalledTimes(3);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retry query operations up to 3 times before failing', () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        failureCountArb(),
        retryableErrorArb(),
        async (pk, skPrefix, failureCount, error) => {
          // Setup fresh mock and service for each property test run
          const mock = setupTest();
          
          if (failureCount < 3) {
            // Should succeed after retries
            for (let i = 0; i < failureCount; i++) {
              mock.mockRejectedValueOnce(error);
            }
            mock.mockResolvedValueOnce({ Items: [{ PK: pk }] });

            const result = await service.query(pk, skPrefix);

            expect(result).toEqual([{ PK: pk }]);
            expect(mock).toHaveBeenCalledTimes(failureCount + 1);
          } else {
            // Should fail after 3 attempts
            mock.mockRejectedValue(error);

            await expect(service.query(pk, skPrefix)).rejects.toThrow(
              'DynamoDB operation failed after 3 attempts'
            );

            expect(mock).toHaveBeenCalledTimes(3);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retry update operations up to 3 times before failing', () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.record({
          Status: fc.oneof(
            fc.constant('created'),
            fc.constant('in_progress'),
            fc.constant('completed')
          ),
        }),
        failureCountArb(),
        retryableErrorArb(),
        async (pk, sk, updates, failureCount, error) => {
          // Setup fresh mock and service for each property test run
          const mock = setupTest();
          
          if (failureCount < 3) {
            // Should succeed after retries
            for (let i = 0; i < failureCount; i++) {
              mock.mockRejectedValueOnce(error);
            }
            mock.mockResolvedValueOnce({});

            await service.update(pk, sk, updates);

            expect(mock).toHaveBeenCalledTimes(failureCount + 1);
          } else {
            // Should fail after 3 attempts
            mock.mockRejectedValue(error);

            await expect(service.update(pk, sk, updates)).rejects.toThrow(
              'DynamoDB operation failed after 3 attempts'
            );

            expect(mock).toHaveBeenCalledTimes(3);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use exponential backoff between retries', () => {
    fc.assert(
      fc.asyncProperty(
        dynamoItemArb(),
        fc.integer({ min: 1, max: 2 }), // 1 or 2 failures before success
        retryableErrorArb(),
        async (item, failureCount, error) => {
          // Setup fresh mock and service for each property test run
          const mock = setupTest();
          
          // Setup mock to fail failureCount times, then succeed
          for (let i = 0; i < failureCount; i++) {
            mock.mockRejectedValueOnce(error);
          }
          mock.mockResolvedValueOnce({});

          const startTime = Date.now();
          await service.put(item);
          const endTime = Date.now();
          const elapsed = endTime - startTime;

          // Calculate minimum expected delay with exponential backoff
          // baseDelay = 10ms
          // First retry: ~10ms
          // Second retry: ~20ms
          let minExpectedDelay = 0;
          for (let i = 0; i < failureCount; i++) {
            minExpectedDelay += 10 * Math.pow(2, i);
          }

          // Allow some tolerance for test execution overhead
          // but verify there was some delay (at least 50% of expected)
          expect(elapsed).toBeGreaterThanOrEqual(minExpectedDelay * 0.5);
        }
      ),
      { numRuns: 50 } // Fewer runs for timing-sensitive test
    );
  });

  it('should not retry on first successful attempt', () => {
    fc.assert(
      fc.asyncProperty(dynamoItemArb(), async (item) => {
        // Setup fresh mock and service for each property test run
        const mock = setupTest();
        mock.mockResolvedValueOnce({});

        await service.put(item);

        // Should only be called once if successful
        expect(mock).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve error message in final failure', () => {
    fc.assert(
      fc.asyncProperty(
        dynamoItemArb(),
        fc.string({ minLength: 10, maxLength: 100 }),
        async (item, errorMessage) => {
          // Setup fresh mock and service for each property test run
          const mock = setupTest();
          
          const error = new Error(errorMessage);
          mock.mockRejectedValue(error);

          await expect(service.put(item)).rejects.toThrow(
            `DynamoDB operation failed after 3 attempts: ${errorMessage}`
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle mixed error types across retries', () => {
    fc.assert(
      fc.asyncProperty(
        dynamoItemArb(),
        fc.array(retryableErrorArb(), { minLength: 2, maxLength: 2 }),
        async (item, errors) => {
          // Setup fresh mock and service for each property test run
          const mock = setupTest();
          
          // Fail with different errors, then succeed
          mock.mockRejectedValueOnce(errors[0]);
          mock.mockRejectedValueOnce(errors[1]);
          mock.mockResolvedValueOnce({});

          await service.put(item);

          expect(mock).toHaveBeenCalledTimes(3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should apply retry logic consistently across all operations', () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.integer({ min: 0, max: 2 }),
        retryableErrorArb(),
        async (pk, sk, failureCount, error) => {
          // Test that all four operations (put, get, query, update) behave the same
          const item = { PK: pk, SK: sk, Data: 'test' };

          // Test put - setup fresh service for this operation
          let mock = setupTest();
          for (let i = 0; i < failureCount; i++) {
            mock.mockRejectedValueOnce(error);
          }
          mock.mockResolvedValueOnce({});
          await service.put(item);
          const putCalls = mock.mock.calls.length;

          // Test get - setup fresh service for this operation
          mock = setupTest();
          for (let i = 0; i < failureCount; i++) {
            mock.mockRejectedValueOnce(error);
          }
          mock.mockResolvedValueOnce({ Item: item });
          await service.get(pk, sk);
          const getCalls = mock.mock.calls.length;

          // Test query - setup fresh service for this operation
          mock = setupTest();
          for (let i = 0; i < failureCount; i++) {
            mock.mockRejectedValueOnce(error);
          }
          mock.mockResolvedValueOnce({ Items: [item] });
          await service.query(pk);
          const queryCalls = mock.mock.calls.length;

          // Test update - setup fresh service for this operation
          mock = setupTest();
          for (let i = 0; i < failureCount; i++) {
            mock.mockRejectedValueOnce(error);
          }
          mock.mockResolvedValueOnce({});
          await service.update(pk, sk, { Status: 'completed' });
          const updateCalls = mock.mock.calls.length;

          // All operations should have the same number of calls
          expect(putCalls).toBe(failureCount + 1);
          expect(getCalls).toBe(failureCount + 1);
          expect(queryCalls).toBe(failureCount + 1);
          expect(updateCalls).toBe(failureCount + 1);
        }
      ),
      { numRuns: 50 }
    );
  });
});
