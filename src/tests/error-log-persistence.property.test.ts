/**
 * Property-Based Test: Error Log Persistence
 * Feature: firstline-triage-platform
 * Property 38: Error Log Persistence
 * 
 * **Validates: Requirements 17.6**
 * 
 * Test that errors encountered in the smartphone app are stored locally
 * and uploaded when connectivity is available.
 */

import * as fc from 'fast-check';
import { ErrorLoggingService } from '../services/error-logging.service';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CloudWatchLogsClient,
  PutLogEventsCommand,
  CreateLogStreamCommand,
  DescribeLogStreamsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Mock AWS clients
const cloudWatchMock = mockClient(CloudWatchLogsClient);
const s3Mock = mockClient(S3Client);

// Generators for test data
const errorTypeArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('TypeError'),
    fc.constant('ReferenceError'),
    fc.constant('NetworkError'),
    fc.constant('ValidationError'),
    fc.constant('DatabaseError'),
    fc.constant('Error')
  );

const errorMessageArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 10, maxLength: 200 });

const errorStackArb = (): fc.Arbitrary<string | undefined> =>
  fc.option(
    fc.string({ minLength: 50, maxLength: 500 }),
    { nil: undefined }
  );

const contextArb = (): fc.Arbitrary<Record<string, any> | undefined> =>
  fc.option(
    fc.record({
      userId: fc.option(fc.string(), { nil: undefined }),
      action: fc.option(fc.string(), { nil: undefined }),
      timestamp: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined }),
      metadata: fc.option(fc.record({
        key: fc.string(),
        value: fc.string(),
      }), { nil: undefined }),
    }),
    { nil: undefined }
  );

const encounterIdArb = (): fc.Arbitrary<string | undefined> =>
  fc.option(
    fc.uuid(),
    { nil: undefined }
  );

const errorArb = (): fc.Arbitrary<Error> =>
  fc.tuple(errorTypeArb(), errorMessageArb(), errorStackArb()).map(
    ([type, message, stack]) => {
      const error = new Error(message);
      error.name = type;
      if (stack) {
        error.stack = stack;
      }
      return error;
    }
  );

describe('Property 38: Error Log Persistence', () => {
  let service: ErrorLoggingService;

  beforeEach(() => {
    cloudWatchMock.reset();
    s3Mock.reset();
    
    // Mock successful CloudWatch operations
    cloudWatchMock.on(DescribeLogStreamsCommand).resolves({
      $metadata: {},
      logStreams: [{ logStreamName: 'test-stream' }],
    });
    cloudWatchMock.on(CreateLogStreamCommand).resolves({ $metadata: {} });
    cloudWatchMock.on(PutLogEventsCommand).resolves({ $metadata: {} });
    
    // Mock successful S3 operations
    s3Mock.on(PutObjectCommand).resolves({ $metadata: {} });

    service = new ErrorLoggingService({
      logGroupName: 'test-log-group',
      s3BucketName: 'test-bucket',
      region: 'us-east-1',
    });
  });

  it('should store error logs locally', () => {
    fc.assert(
      fc.property(
        errorArb(),
        contextArb(),
        encounterIdArb(),
        (error, context, encounterId) => {
          // Log the error
          const errorLog = service.logError(error, context, encounterId);

          // Verify error log is created
          expect(errorLog).toBeDefined();
          expect(errorLog.id).toBeDefined();
          expect(errorLog.timestamp).toBeDefined();
          expect(errorLog.errorType).toBe(error.name);
          expect(errorLog.errorMessage).toBe(error.message);
          expect(errorLog.uploaded).toBe(false);

          // Verify it's stored locally
          const localLogs = service.getLocalLogs();
          expect(localLogs.length).toBeGreaterThan(0);
          
          const found = localLogs.find(log => log.id === errorLog.id);
          expect(found).toBeDefined();
          expect(found!.errorType).toBe(error.name);
          expect(found!.errorMessage).toBe(error.message);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should mark error logs as not uploaded initially', () => {
    fc.assert(
      fc.property(
        errorArb(),
        contextArb(),
        encounterIdArb(),
        (error, context, encounterId) => {
          // Log the error
          const errorLog = service.logError(error, context, encounterId);

          // Verify uploaded flag is false
          expect(errorLog.uploaded).toBe(false);

          // Verify it's in pending logs
          const pendingLogs = service.getPendingLogs();
          const found = pendingLogs.find(log => log.id === errorLog.id);
          expect(found).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should store error context and encounter ID', () => {
    fc.assert(
      fc.property(
        errorArb(),
        contextArb(),
        encounterIdArb(),
        (error, context, encounterId) => {
          // Log the error with context
          const errorLog = service.logError(error, context, encounterId);

          // Verify context is stored
          if (context) {
            expect(errorLog.context).toEqual(context);
          }

          // Verify encounter ID is stored
          if (encounterId) {
            expect(errorLog.encounterId).toBe(encounterId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should upload error logs to CloudWatch when connectivity is available', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(errorArb(), { minLength: 1, maxLength: 10 }),
        async (errors) => {
          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log all errors
          errors.forEach(error => testService.logError(error));

          // Verify all are pending
          expect(testService.getPendingLogs().length).toBe(errors.length);

          // Upload to CloudWatch
          const uploadedCount = await testService.uploadToCloudWatch();

          // Verify all were uploaded
          expect(uploadedCount).toBe(errors.length);

          // Verify no pending logs remain
          expect(testService.getPendingLogs().length).toBe(0);

          // Verify CloudWatch was called
          expect(cloudWatchMock.calls().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should upload error logs to S3 when connectivity is available', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(errorArb(), { minLength: 1, maxLength: 10 }),
        async (errors) => {
          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log all errors
          errors.forEach(error => testService.logError(error));

          // Verify all are pending
          expect(testService.getPendingLogs().length).toBe(errors.length);

          // Upload to S3
          const uploadedCount = await testService.uploadToS3();

          // Verify all were uploaded
          expect(uploadedCount).toBe(errors.length);

          // Verify no pending logs remain
          expect(testService.getPendingLogs().length).toBe(0);

          // Verify S3 was called
          expect(s3Mock.calls().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should mark logs as uploaded after successful upload', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(errorArb(), { minLength: 1, maxLength: 5 }),
        async (errors) => {
          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log all errors
          const errorLogs = errors.map(error => testService.logError(error));

          // Upload to CloudWatch
          await testService.uploadToCloudWatch();

          // Verify all logs are marked as uploaded
          const allLogs = testService.getLocalLogs();
          errorLogs.forEach(errorLog => {
            const found = allLogs.find(log => log.id === errorLog.id);
            expect(found).toBeDefined();
            expect(found!.uploaded).toBe(true);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle multiple errors with different types', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(errorArb(), contextArb(), encounterIdArb()),
          { minLength: 1, maxLength: 20 }
        ),
        (errorData) => {
          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log all errors
          const errorLogs = errorData.map(([error, context, encounterId]) =>
            testService.logError(error, context, encounterId)
          );

          // Verify all are stored
          const localLogs = testService.getLocalLogs();
          expect(localLogs.length).toBe(errorData.length);

          // Verify each error log
          errorLogs.forEach((errorLog, index) => {
            const [error, context, encounterId] = errorData[index];
            const found = localLogs.find(log => log.id === errorLog.id);
            
            expect(found).toBeDefined();
            expect(found!.errorType).toBe(error.name);
            expect(found!.errorMessage).toBe(error.message);
            
            if (context) {
              expect(found!.context).toEqual(context);
            }
            
            if (encounterId) {
              expect(found!.encounterId).toBe(encounterId);
            }
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should provide accurate statistics', () => {
    fc.assert(
      fc.property(
        fc.array(errorArb(), { minLength: 0, maxLength: 20 }),
        (errors) => {
          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log all errors
          errors.forEach(error => testService.logError(error));

          // Get statistics
          const stats = testService.getStatistics();

          // Verify statistics
          expect(stats.total).toBe(errors.length);
          expect(stats.uploaded).toBe(0);
          expect(stats.pending).toBe(errors.length);
          
          if (errors.length > 0) {
            expect(stats.oldestPending).toBeDefined();
          } else {
            expect(stats.oldestPending).toBeUndefined();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should enforce max local logs limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        fc.array(errorArb(), { minLength: 30, maxLength: 50 }),
        (maxLogs, errors) => {
          // Create service with limited storage
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
            maxLocalLogs: maxLogs,
          });

          // Log all errors
          errors.forEach(error => testService.logError(error));

          // Verify storage doesn't exceed limit
          const localLogs = testService.getLocalLogs();
          expect(localLogs.length).toBeLessThanOrEqual(maxLogs);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should clear uploaded logs from local storage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(errorArb(), { minLength: 1, maxLength: 10 }),
        async (errors) => {
          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log all errors
          errors.forEach(error => testService.logError(error));

          // Upload to CloudWatch
          await testService.uploadToCloudWatch();

          // Clear uploaded logs
          const clearedCount = testService.clearUploadedLogs();

          // Verify all uploaded logs were cleared
          expect(clearedCount).toBe(errors.length);
          expect(testService.getLocalLogs().length).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle upload failures gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(errorArb(), { minLength: 1, maxLength: 5 }),
        async (errors) => {
          // Mock CloudWatch failure
          cloudWatchMock.reset();
          cloudWatchMock.on(DescribeLogStreamsCommand).rejects(new Error('Network error'));

          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log all errors
          errors.forEach(error => testService.logError(error));

          // Try to upload (should handle failure)
          const uploadedCount = await testService.uploadToCloudWatch();

          // Verify no logs were marked as uploaded due to failure
          expect(uploadedCount).toBe(0);
          expect(testService.getPendingLogs().length).toBe(errors.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should preserve error stack traces', () => {
    fc.assert(
      fc.property(
        errorArb(),
        (error) => {
          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log the error
          const errorLog = testService.logError(error);

          // Verify stack trace is preserved
          if (error.stack) {
            expect(errorLog.errorStack).toBe(error.stack);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include device information in error logs', () => {
    fc.assert(
      fc.property(
        errorArb(),
        (error) => {
          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log the error
          const errorLog = testService.logError(error);

          // Verify device info is included
          expect(errorLog.deviceInfo).toBeDefined();
          expect(errorLog.deviceInfo!.platform).toBeDefined();
          expect(errorLog.deviceInfo!.version).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate unique log IDs', () => {
    fc.assert(
      fc.property(
        fc.array(errorArb(), { minLength: 2, maxLength: 20 }),
        (errors) => {
          // Create a fresh service for each test
          const testService = new ErrorLoggingService({
            logGroupName: 'test-log-group',
            s3BucketName: 'test-bucket',
            region: 'us-east-1',
          });

          // Log all errors
          const errorLogs = errors.map(error => testService.logError(error));

          // Verify all IDs are unique
          const ids = errorLogs.map(log => log.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle empty error logs gracefully', () => {
    const testService = new ErrorLoggingService({
      logGroupName: 'test-log-group',
      s3BucketName: 'test-bucket',
      region: 'us-east-1',
    });

    expect(testService.getLocalLogs()).toEqual([]);
    expect(testService.getPendingLogs()).toEqual([]);
    expect(testService.getStatistics().total).toBe(0);
    expect(testService.clearUploadedLogs()).toBe(0);
  });
});
