/**
 * Property-Based Test: Encounter Metadata Completeness
 * Feature: firstline-triage-platform
 * Property 2: Encounter Metadata Completeness
 * 
 * **Validates: Requirements 1.6**
 * 
 * Test that all encounters include complete metadata: timestamp, channel,
 * encounter ID, and status.
 */

import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../services/dynamodb.service';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/util-dynamodb');

// Generators for test data
const channelArb = (): fc.Arbitrary<'app' | 'voice' | 'ussd' | 'sms'> =>
  fc.oneof(
    fc.constant('app' as const),
    fc.constant('voice' as const),
    fc.constant('ussd' as const),
    fc.constant('sms' as const)
  );

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

const encounterDataArb = (): fc.Arbitrary<{
  channel: 'app' | 'voice' | 'ussd' | 'sms';
  demographics: { age: number; sex: 'M' | 'F' | 'O'; location: string };
  symptoms: string;
  offlineCreated?: boolean;
}> =>
  fc.record({
    channel: channelArb(),
    demographics: demographicsArb(),
    symptoms: fc.string({ minLength: 10, maxLength: 500 }),
    offlineCreated: fc.option(fc.boolean(), { nil: undefined }),
  });

describe('Property 2: Encounter Metadata Completeness', () => {
  let service: DynamoDBService;
  let mockSend: jest.Mock;

  beforeAll(() => {
    (marshall as jest.Mock).mockImplementation((obj) => obj);
    (unmarshall as jest.Mock).mockImplementation((obj) => obj);
  });

  beforeEach(() => {
    mockSend = jest.fn().mockResolvedValue({});
    (DynamoDBClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    service = new DynamoDBService({
      tableName: 'test-table',
      region: 'us-east-1',
      maxRetries: 3,
      baseDelayMs: 10,
    });
  });

  it('should include all required metadata fields in every encounter', async () => {
    // Simple test first
    mockSend.mockClear();
    const encounterId = uuidv4();
    
    await service.createEncounter({
      encounterId,
      channel: 'app',
      demographics: {
        age: 30,
        sex: 'M',
        location: 'Test',
      },
      symptoms: 'Test symptoms',
    });

    // Check if mockSend was called
    expect(mockSend).toHaveBeenCalled();
    console.log('mockSend.mock.calls.length:', mockSend.mock.calls.length);
    console.log('mockSend.mock.calls[0]:', mockSend.mock.calls[0]);
    
    const command = mockSend.mock.calls[0][0];
    console.log('command:', command);
    console.log('command.input:', command?.input);
    
    const encounter = command.input.Item;
    
    expect(encounter).toHaveProperty('EncounterId');
    expect(encounter).toHaveProperty('Channel');
    expect(encounter).toHaveProperty('Timestamp');
    expect(encounter).toHaveProperty('Status');
  });

  it('should include timestamp in ISO8601 format', async () => {
    await fc.assert(
      fc.asyncProperty(encounterDataArb(), async (data) => {
        mockSend.mockClear();
        const encounterId = uuidv4();
        
        await service.createEncounter({
          encounterId,
          ...data,
        });

        const command = mockSend.mock.calls[0][0] as PutItemCommand;
        const encounter = command.input.Item;
        
        expect(encounter).toBeDefined();
        expect(encounter!.Timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        
        const timestamp = new Date(encounter!.Timestamp as unknown as string);
        expect(timestamp.toString()).not.toBe('Invalid Date');
      }),
      { numRuns: 100 }
    );
  });

  it('should include TTL field for data retention', async () => {
    await fc.assert(
      fc.asyncProperty(encounterDataArb(), async (data) => {
        mockSend.mockClear();
        const encounterId = uuidv4();
        
        await service.createEncounter({
          encounterId,
          ...data,
        });

        const command = mockSend.mock.calls[0][0] as PutItemCommand;
        const encounter = command.input.Item;
        
        expect(encounter).toBeDefined();
        expect(encounter).toHaveProperty('TTL');
        expect(typeof encounter!.TTL).toBe('number');
        
        const now = Math.floor(Date.now() / 1000);
        expect(encounter!.TTL).toBeGreaterThan(now);
      }),
      { numRuns: 100 }
    );
  });

  it('should include GSI keys for querying', async () => {
    await fc.assert(
      fc.asyncProperty(encounterDataArb(), async (data) => {
        mockSend.mockClear();
        const encounterId = uuidv4();
        
        await service.createEncounter({
          encounterId,
          ...data,
        });

        const command = mockSend.mock.calls[0][0] as PutItemCommand;
        const encounter = command.input.Item;
        
        expect(encounter).toBeDefined();
        expect(encounter).toHaveProperty('GSI1PK');
        expect(encounter).toHaveProperty('GSI1SK');
        
        expect(encounter!.GSI1PK).toMatch(/^DATE#\d{4}-\d{2}-\d{2}$/);
        expect(encounter!.GSI1SK).toMatch(/^CHANNEL#(app|voice|ussd|sms)#TIME#\d{4}-\d{2}-\d{2}T/);
      }),
      { numRuns: 100 }
    );
  });

  it('should include OfflineCreated flag', async () => {
    await fc.assert(
      fc.asyncProperty(encounterDataArb(), async (data) => {
        mockSend.mockClear();
        const encounterId = uuidv4();
        
        await service.createEncounter({
          encounterId,
          ...data,
        });

        const command = mockSend.mock.calls[0][0] as PutItemCommand;
        const encounter = command.input.Item;
        
        expect(encounter).toBeDefined();
        expect(encounter).toHaveProperty('OfflineCreated');
        expect(typeof encounter!.OfflineCreated).toBe('boolean');
        
        if (data.offlineCreated !== undefined) {
          expect(encounter!.OfflineCreated).toBe(data.offlineCreated);
        } else {
          expect(encounter!.OfflineCreated).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should include SyncedAt timestamp for offline encounters', async () => {
    await fc.assert(
      fc.asyncProperty(encounterDataArb(), async (data) => {
        mockSend.mockClear();
        const encounterId = uuidv4();
        
        await service.createEncounter({
          encounterId,
          ...data,
          offlineCreated: true,
        });

        const command = mockSend.mock.calls[0][0] as PutItemCommand;
        const encounter = command.input.Item;
        
        expect(encounter).toBeDefined();
        expect(encounter).toHaveProperty('SyncedAt');
        expect(encounter!.SyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }),
      { numRuns: 100 }
    );
  });

  it('should include Type field for entity identification', async () => {
    await fc.assert(
      fc.asyncProperty(encounterDataArb(), async (data) => {
        mockSend.mockClear();
        const encounterId = uuidv4();
        
        await service.createEncounter({
          encounterId,
          ...data,
        });

        const command = mockSend.mock.calls[0][0] as PutItemCommand;
        const encounter = command.input.Item;
        
        expect(encounter).toBeDefined();
        expect(encounter!.Type).toBe('Encounter');
      }),
      { numRuns: 100 }
    );
  });

  it('should include partition and sort keys for DynamoDB', async () => {
    await fc.assert(
      fc.asyncProperty(encounterDataArb(), async (data) => {
        mockSend.mockClear();
        const encounterId = uuidv4();
        
        await service.createEncounter({
          encounterId,
          ...data,
        });

        const command = mockSend.mock.calls[0][0] as PutItemCommand;
        const encounter = command.input.Item;
        
        expect(encounter).toBeDefined();
        expect(encounter).toHaveProperty('PK');
        expect(encounter).toHaveProperty('SK');
        
        expect(encounter!.PK).toBe(`ENC#${encounterId}`);
        expect(encounter!.SK).toBe('METADATA');
      }),
      { numRuns: 100 }
    );
  });
});
