/**
 * Property-Based Test: Local Protocol Configuration
 * 
 * Property 31: Local Protocol Configuration
 * 
 * **Validates: Requirements 14.5**
 * 
 * For any configured local health protocol, it should be included in the
 * AI Engine prompt and be retrievable from system configuration.
 * 
 * Feature: firstline-triage-platform, Property 31: Local Protocol Configuration
 */

import * as fc from 'fast-check';
import { ConfigurationService } from '../services/configuration.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// Mock AWS SDKs
jest.mock('@aws-sdk/client-dynamodb');

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid protocol content
 */
const protocolContentArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('Standard WHO guidelines'),
    fc.constant('Local malaria screening protocols for Sub-Saharan Africa'),
    fc.constant('COVID-19 triage protocols with emphasis on respiratory symptoms'),
    fc.constant('Maternal health protocols for pregnancy-related danger signs'),
    fc.constant('Pediatric triage protocols for children under 5 years'),
    fc.string({ minLength: 20, maxLength: 500 })
  );

/**
 * Generate protocol descriptions
 */
const protocolDescriptionArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 10, maxLength: 200 });

/**
 * Generate protocol versions
 */
const protocolVersionArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('v1.0'),
    fc.constant('v2.0'),
    fc.date().map(d => d.toISOString()),
    fc.string({ minLength: 5, maxLength: 20 })
  );

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 31: Local Protocol Configuration', () => {
  let configurationService: ConfigurationService;
  let dynamoDBService: DynamoDBService;
  let mockDynamoDBSend: jest.Mock;
  let storedProtocols: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    storedProtocols = new Map();

    // Mock DynamoDB
    mockDynamoDBSend = jest.fn().mockImplementation((command) => {
      const commandName = command.constructor.name;

      if (commandName === 'PutItemCommand') {
        // Store protocol
        const item = command.input.Item;
        const pk = item.PK.S;
        const sk = item.SK.S;
        const key = `${pk}#${sk}`;
        
        // Unmarshal the item for storage
        const stored: any = {};
        for (const [field, value] of Object.entries(item)) {
          if (typeof value === 'object' && value !== null) {
            if ('S' in value) stored[field] = (value as any).S;
            else if ('N' in value) stored[field] = (value as any).N;
            else if ('BOOL' in value) stored[field] = (value as any).BOOL;
            else stored[field] = value;
          } else {
            stored[field] = value;
          }
        }
        
        storedProtocols.set(key, stored);
        return Promise.resolve({});
      }

      if (commandName === 'GetItemCommand') {
        // Retrieve protocol
        const pk = command.input.Key.PK.S;
        const sk = command.input.Key.SK.S;
        const key = `${pk}#${sk}`;
        
        const stored = storedProtocols.get(key);
        if (!stored) {
          return Promise.resolve({});
        }

        // Marshal the item for return
        const item: any = {};
        for (const [field, value] of Object.entries(stored)) {
          if (typeof value === 'string') {
            item[field] = { S: value };
          } else if (typeof value === 'number') {
            item[field] = { N: value.toString() };
          } else if (typeof value === 'boolean') {
            item[field] = { BOOL: value };
          } else {
            item[field] = value;
          }
        }

        return Promise.resolve({ Item: item });
      }

      if (commandName === 'QueryCommand') {
        // Query protocols by prefix
        const pk = command.input.ExpressionAttributeValues[':pk'].S;
        const skPrefix = command.input.ExpressionAttributeValues[':sk']?.S;

        const results: any[] = [];
        for (const [key, value] of storedProtocols.entries()) {
          const [storedPk, storedSk] = key.split('#');
          if (storedPk === pk && (!skPrefix || storedSk.startsWith(skPrefix))) {
            // Marshal the item
            const item: any = {};
            for (const [field, val] of Object.entries(value)) {
              if (typeof val === 'string') {
                item[field] = { S: val };
              } else if (typeof val === 'number') {
                item[field] = { N: val.toString() };
              } else if (typeof val === 'boolean') {
                item[field] = { BOOL: val };
              } else {
                item[field] = val;
              }
            }
            results.push(item);
          }
        }

        return Promise.resolve({ Items: results });
      }

      return Promise.resolve({});
    });

    (DynamoDBClient as jest.Mock).mockImplementation(() => ({
      send: mockDynamoDBSend,
    }));

    // Create services
    dynamoDBService = new DynamoDBService({
      tableName: 'test-table',
      region: 'us-east-1',
    });

    configurationService = new ConfigurationService({
      dynamoDBService,
      cacheEnabled: true,
    });
  });

  it('should store and retrieve local health protocols', () => {
    fc.assert(
      fc.asyncProperty(
        protocolContentArb(),
        protocolDescriptionArb(),
        async (content, description) => {
          // Set protocol
          const version = await configurationService.setProtocol(
            content,
            description
          );

          expect(version).toBeDefined();
          expect(typeof version).toBe('string');

          // Retrieve active protocol
          const retrievedProtocol = await configurationService.getActiveProtocol();

          // Should match the stored content
          expect(retrievedProtocol).toBe(content);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should cache protocols and return cached value on subsequent calls', () => {
    fc.assert(
      fc.asyncProperty(
        protocolContentArb(),
        protocolDescriptionArb(),
        async (content, description) => {
          // Set protocol
          await configurationService.setProtocol(content, description);

          // First call - should fetch from DynamoDB
          const firstCall = await configurationService.getActiveProtocol();
          const firstCallCount = mockDynamoDBSend.mock.calls.length;

          // Second call - should use cache
          const secondCall = await configurationService.getActiveProtocol();
          const secondCallCount = mockDynamoDBSend.mock.calls.length;

          // Both should return same content
          expect(firstCall).toBe(content);
          expect(secondCall).toBe(content);

          // Second call should not make additional DynamoDB calls
          expect(secondCallCount).toBe(firstCallCount);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should update active protocol and invalidate cache', () => {
    fc.assert(
      fc.asyncProperty(
        protocolContentArb(),
        protocolContentArb(),
        protocolDescriptionArb(),
        protocolDescriptionArb(),
        async (content1, content2, desc1, desc2) => {
          // Ensure contents are different
          fc.pre(content1 !== content2);

          // Set first protocol
          await configurationService.setProtocol(content1, desc1);
          const first = await configurationService.getActiveProtocol();
          expect(first).toBe(content1);

          // Update to second protocol
          await configurationService.updateProtocol(content2, desc2);
          const second = await configurationService.getActiveProtocol();

          // Should return updated content
          expect(second).toBe(content2);
          expect(second).not.toBe(content1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should retrieve specific protocol versions', () => {
    fc.assert(
      fc.asyncProperty(
        protocolContentArb(),
        protocolDescriptionArb(),
        protocolVersionArb(),
        async (content, description, version) => {
          // Set protocol with specific version
          const createdVersion = await configurationService.setProtocol(
            content,
            description,
            version
          );

          expect(createdVersion).toBe(version);

          // Retrieve specific version
          const retrieved = await configurationService.getProtocolVersion(version);

          expect(retrieved).not.toBeNull();
          expect(retrieved!.Content).toBe(content);
          expect(retrieved!.Description).toBe(description);
          expect(retrieved!.Version).toBe(version);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should list all protocol versions', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            content: protocolContentArb(),
            description: protocolDescriptionArb(),
            version: protocolVersionArb(),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (protocols) => {
          // Ensure unique versions
          const uniqueProtocols = protocols.filter(
            (p, i, arr) => arr.findIndex(x => x.version === p.version) === i
          );

          // Set all protocols
          for (const protocol of uniqueProtocols) {
            await configurationService.setProtocol(
              protocol.content,
              protocol.description,
              protocol.version
            );
          }

          // List all versions
          const versions = await configurationService.listProtocolVersions();

          // Should have at least as many versions as we created
          expect(versions.length).toBeGreaterThanOrEqual(uniqueProtocols.length);

          // All created versions should be in the list
          for (const protocol of uniqueProtocols) {
            const found = versions.find(v => v.Version === protocol.version);
            expect(found).toBeDefined();
            expect(found!.Content).toBe(protocol.content);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should return default protocol when no active protocol is configured', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Don't set any protocol
          const protocol = await configurationService.getActiveProtocol();

          // Should return default WHO guidelines
          expect(protocol).toBe('Standard WHO guidelines');
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should preload protocol at initialization', () => {
    fc.assert(
      fc.asyncProperty(
        protocolContentArb(),
        protocolDescriptionArb(),
        async (content, description) => {
          // Set protocol
          await configurationService.setProtocol(content, description);

          // Create new service instance
          const newConfigService = new ConfigurationService({
            dynamoDBService,
            cacheEnabled: true,
          });

          // Preload protocol
          const preloaded = await newConfigService.preloadProtocol();

          // Should return the active protocol
          expect(preloaded).toBe(content);

          // Subsequent calls should use cache
          const callCountBefore = mockDynamoDBSend.mock.calls.length;
          const cached = await newConfigService.getActiveProtocol();
          const callCountAfter = mockDynamoDBSend.mock.calls.length;

          expect(cached).toBe(content);
          expect(callCountAfter).toBe(callCountBefore); // No additional calls
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle protocol retrieval errors gracefully', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Mock DynamoDB to throw error
          mockDynamoDBSend.mockRejectedValue(new Error('DynamoDB error'));

          // Should return default protocol on error
          const protocol = await configurationService.getActiveProtocol();
          expect(protocol).toBe('Standard WHO guidelines');
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should maintain protocol versioning', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            content: protocolContentArb(),
            description: protocolDescriptionArb(),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (protocols) => {
          const versions: string[] = [];

          // Create multiple versions
          for (const protocol of protocols) {
            const version = await configurationService.setProtocol(
              protocol.content,
              protocol.description
            );
            versions.push(version);
          }

          // Active protocol should be the last one
          const activeProtocol = await configurationService.getActiveProtocol();
          expect(activeProtocol).toBe(protocols[protocols.length - 1].content);

          // All versions should be retrievable
          for (let i = 0; i < versions.length; i++) {
            const retrieved = await configurationService.getProtocolVersion(versions[i]);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.Content).toBe(protocols[i].content);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
