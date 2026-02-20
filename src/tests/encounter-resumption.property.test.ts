/**
 * Property-Based Test: Encounter Resumption
 * 
 * Property 37: Encounter Resumption
 * 
 * For any interrupted encounter (e.g., dropped voice call), the system should
 * allow resuming the encounter by providing the encounter ID.
 * 
 * **Validates: Requirements 17.5**
 * 
 * Feature: firstline-triage-platform, Property 37: Encounter Resumption
 */

import * as fc from 'fast-check';
import { handler } from '../handlers/voice-handler';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';

describe('Property 37: Encounter Resumption', () => {
  const dynamoMock = mockClient(DynamoDBClient);

  beforeEach(() => {
    dynamoMock.reset();
  });

  /**
   * Generator for voice conversation state at various steps
   * Helper to remove undefined values from objects for DynamoDB compatibility
   */
  const removeUndefined = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(removeUndefined);
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          cleaned[key] = removeUndefined(value);
        }
      }
      return cleaned;
    }
    return obj;
  };

  const voiceConversationStateArbitrary = fc.record({
    contactId: fc.uuid(),
    phoneNumber: fc.string({ minLength: 10, maxLength: 15 }).map(s => '+1' + s.replace(/\D/g, '').slice(0, 10)),
    encounterId: fc.uuid(),
    step: fc.constantFrom('AGE', 'SEX', 'LOCATION', 'SYMPTOMS', 'FOLLOWUP', 'TRIAGE'),
    demographics: fc.record({
      age: fc.option(fc.integer({ min: 0, max: 120 }), { nil: undefined }),
      sex: fc.option(fc.constantFrom('M', 'F', 'O'), { nil: undefined }),
      location: fc.option(fc.string({ minLength: 3, maxLength: 100 }), { nil: undefined }),
    }),
    symptoms: fc.option(fc.string({ minLength: 5, maxLength: 500 }), { nil: undefined }),
    currentFollowupIndex: fc.option(fc.integer({ min: 0, max: 4 }), { nil: undefined }),
    followupQuestions: fc.option(
      fc.array(fc.string({ minLength: 10, maxLength: 200 }), { minLength: 3, maxLength: 5 }),
      { nil: undefined }
    ),
  });

  /**
   * Generator for encounter data stored in DynamoDB
   */
  const encounterDataArbitrary = fc.record({
    encounterId: fc.uuid(),
    channel: fc.constant('voice'),
    demographics: fc.record({
      age: fc.integer({ min: 0, max: 120 }),
      sex: fc.constantFrom('M', 'F', 'O'),
      location: fc.string({ minLength: 3, maxLength: 100 }),
    }),
    symptoms: fc.string({ minLength: 5, maxLength: 500 }),
  });

  it('should preserve encounter state when resuming a dropped call', async () => {
    await fc.assert(
      fc.asyncProperty(
        voiceConversationStateArbitrary,
        async (originalState) => {
          // Arrange: Set up original conversation state in DynamoDB
          const originalContactId = originalState.contactId;
          const newContactId = fc.sample(fc.uuid(), 1)[0];

          const voiceStateItem = removeUndefined({
            PK: `VOICE#${originalContactId}`,
            SK: 'STATE',
            Type: 'VoiceConversation',
            ContactId: originalContactId,
            PhoneNumber: originalState.phoneNumber,
            EncounterId: originalState.encounterId,
            Step: originalState.step,
            Demographics: originalState.demographics,
            Symptoms: originalState.symptoms,
            CurrentFollowupIndex: originalState.currentFollowupIndex,
            FollowupQuestions: originalState.followupQuestions,
            LastInteractionTimestamp: new Date().toISOString(),
            TTL: Math.floor(Date.now() / 1000) + 3600,
          });

          // Mock DynamoDB to return the original state when queried
          dynamoMock.on(GetItemCommand).callsFake((input) => {
            const pk = input.Key?.PK?.S;
            if (pk === `VOICE#${originalContactId}`) {
              return { Item: marshall(voiceStateItem, { removeUndefinedValues: true }) };
            }
            if (pk === `VOICE#${newContactId}`) {
              return {}; // New contact has no state yet
            }
            return {};
          });

          dynamoMock.on(PutItemCommand).resolves({});

          // Act: Simulate a resumed call with InitialContactId
          const event = {
            Details: {
              ContactData: {
                ContactId: newContactId,
                CustomerEndpoint: {
                  Address: originalState.phoneNumber,
                  Type: 'TELEPHONE_NUMBER',
                },
                InitialContactId: originalContactId, // This indicates a resumed call
              },
              Parameters: {},
            },
            Name: 'ResumeCall',
          };

          const response = await handler(event);

          // Assert: Response should be successful
          expect(response.statusCode).toBe(200);
          expect(response.body).toBeDefined();

          // Verify the response contains a resume message
          expect(response.body).toContain('Welcome back');

          // Verify that DynamoDB was called to save the new conversation state
          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          expect(putCalls.length).toBeGreaterThan(0);

          // Verify the new state preserves the encounter data
          const savedItem = putCalls[putCalls.length - 1].args[0].input.Item;
          expect(savedItem).toBeDefined();

          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const savedState = unmarshall(savedItem!);

          // Requirement 17.5: System SHALL allow resuming encounter by providing encounter ID
          expect(savedState.EncounterId).toBe(originalState.encounterId);
          expect(savedState.Step).toBe(originalState.step);
          
          // Verify demographics are preserved
          if (originalState.demographics.age !== undefined) {
            expect(savedState.Demographics.age).toBe(originalState.demographics.age);
          }
          if (originalState.demographics.sex !== undefined) {
            expect(savedState.Demographics.sex).toBe(originalState.demographics.sex);
          }
          if (originalState.demographics.location !== undefined) {
            expect(savedState.Demographics.location).toBe(originalState.demographics.location);
          }

          // Verify symptoms are preserved
          if (originalState.symptoms !== undefined) {
            expect(savedState.Symptoms).toBe(originalState.symptoms);
          }

          // Verify follow-up progress is preserved
          if (originalState.currentFollowupIndex !== undefined) {
            expect(savedState.CurrentFollowupIndex).toBe(originalState.currentFollowupIndex);
          }
          if (originalState.followupQuestions !== undefined) {
            expect(savedState.FollowupQuestions).toEqual(originalState.followupQuestions);
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should generate appropriate resume message based on current step', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('WELCOME', 'AGE', 'SEX', 'LOCATION', 'SYMPTOMS', 'FOLLOWUP', 'TRIAGE', 'COMPLETED'),
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+1' + s.replace(/\D/g, '').slice(0, 10)),
        async (step, originalContactId, newContactId, phoneNumber) => {
          // Arrange: Set up conversation state at specific step
          const voiceStateItem = removeUndefined({
            PK: `VOICE#${originalContactId}`,
            SK: 'STATE',
            Type: 'VoiceConversation',
            ContactId: originalContactId,
            PhoneNumber: phoneNumber,
            EncounterId: fc.sample(fc.uuid(), 1)[0],
            Step: step,
            Demographics: {},
            LastInteractionTimestamp: new Date().toISOString(),
            TTL: Math.floor(Date.now() / 1000) + 3600,
          });

          dynamoMock.on(GetItemCommand).callsFake((input) => {
            const pk = input.Key?.PK?.S;
            if (pk === `VOICE#${originalContactId}`) {
              return { Item: marshall(voiceStateItem, { removeUndefinedValues: true }) };
            }
            return {};
          });

          dynamoMock.on(PutItemCommand).resolves({});

          // Act: Resume the call
          const event = {
            Details: {
              ContactData: {
                ContactId: newContactId,
                CustomerEndpoint: {
                  Address: phoneNumber,
                  Type: 'TELEPHONE_NUMBER',
                },
                InitialContactId: originalContactId,
              },
              Parameters: {},
            },
            Name: 'ResumeCall',
          };

          const response = await handler(event);

          // Assert: Response should contain step-appropriate message
          expect(response.statusCode).toBe(200);
          expect(response.body).toContain('Welcome back');

          // Verify message is contextually appropriate for the step
          const message = response.body.toLowerCase();
          
          switch (step) {
            case 'AGE':
              expect(message).toMatch(/age/i);
              break;
            case 'SEX':
              expect(message).toMatch(/sex|male|female/i);
              break;
            case 'LOCATION':
              expect(message).toMatch(/location|city/i);
              break;
            case 'SYMPTOMS':
              expect(message).toMatch(/symptom/i);
              break;
            case 'FOLLOWUP':
              expect(message).toMatch(/question/i);
              break;
            case 'COMPLETED':
              expect(message).toMatch(/complete/i);
              break;
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should handle resumption when original contact has no encounter', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+1' + s.replace(/\D/g, '').slice(0, 10)),
        async (originalContactId, newContactId, phoneNumber) => {
          // Arrange: Original contact has no state (e.g., very old or never existed)
          dynamoMock.on(GetItemCommand).resolves({}); // No state found
          dynamoMock.on(PutItemCommand).resolves({});

          // Act: Attempt to resume a call with no original state
          const event = {
            Details: {
              ContactData: {
                ContactId: newContactId,
                CustomerEndpoint: {
                  Address: phoneNumber,
                  Type: 'TELEPHONE_NUMBER',
                },
                InitialContactId: originalContactId,
              },
              Parameters: {},
            },
            Name: 'ResumeCall',
          };

          const response = await handler(event);

          // Assert: Should start a new conversation instead of resuming
          expect(response.statusCode).toBe(200);
          expect(response.body).toBeDefined();

          // Should get a welcome message for new conversation
          expect(response.body).toContain('Welcome');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should preserve all encounter data fields during resumption', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        encounterDataArbitrary,
        fc.array(fc.string({ minLength: 10, maxLength: 200 }), { minLength: 3, maxLength: 5 }),
        fc.integer({ min: 0, max: 4 }),
        async (originalContactId, newContactId, encounterData, followupQuestions, followupIndex) => {
          // Arrange: Set up a complete conversation state with all data
          const voiceStateItem = removeUndefined({
            PK: `VOICE#${originalContactId}`,
            SK: 'STATE',
            Type: 'VoiceConversation',
            ContactId: originalContactId,
            PhoneNumber: '+15551234567',
            EncounterId: encounterData.encounterId,
            Step: 'FOLLOWUP',
            Demographics: encounterData.demographics,
            Symptoms: encounterData.symptoms,
            CurrentFollowupIndex: followupIndex,
            FollowupQuestions: followupQuestions,
            LastInteractionTimestamp: new Date().toISOString(),
            TTL: Math.floor(Date.now() / 1000) + 3600,
          });

          dynamoMock.on(GetItemCommand).callsFake((input) => {
            const pk = input.Key?.PK?.S;
            if (pk === `VOICE#${originalContactId}`) {
              return { Item: marshall(voiceStateItem, { removeUndefinedValues: true }) };
            }
            return {};
          });

          dynamoMock.on(PutItemCommand).resolves({});

          // Act: Resume the call
          const event = {
            Details: {
              ContactData: {
                ContactId: newContactId,
                CustomerEndpoint: {
                  Address: '+15551234567',
                  Type: 'TELEPHONE_NUMBER',
                },
                InitialContactId: originalContactId,
              },
              Parameters: {},
            },
            Name: 'ResumeCall',
          };

          const response = await handler(event);

          // Assert: All data should be preserved
          expect(response.statusCode).toBe(200);

          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          expect(putCalls.length).toBeGreaterThan(0);

          const savedItem = putCalls[putCalls.length - 1].args[0].input.Item;
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const savedState = unmarshall(savedItem!);

          // Verify all fields are preserved
          expect(savedState.EncounterId).toBe(encounterData.encounterId);
          expect(savedState.Demographics.age).toBe(encounterData.demographics.age);
          expect(savedState.Demographics.sex).toBe(encounterData.demographics.sex);
          expect(savedState.Demographics.location).toBe(encounterData.demographics.location);
          expect(savedState.Symptoms).toBe(encounterData.symptoms);
          expect(savedState.CurrentFollowupIndex).toBe(followupIndex);
          expect(savedState.FollowupQuestions).toEqual(followupQuestions);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should not resume if InitialContactId is same as ContactId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+1' + s.replace(/\D/g, '').slice(0, 10)),
        async (contactId, phoneNumber) => {
          // Arrange: InitialContactId is the same as ContactId (not a resumed call)
          dynamoMock.on(GetItemCommand).resolves({});
          dynamoMock.on(PutItemCommand).resolves({});

          // Act: Call with same ContactId and InitialContactId
          const event = {
            Details: {
              ContactData: {
                ContactId: contactId,
                CustomerEndpoint: {
                  Address: phoneNumber,
                  Type: 'TELEPHONE_NUMBER',
                },
                InitialContactId: contactId, // Same as ContactId
              },
              Parameters: {},
            },
            Name: 'StartCall',
          };

          const response = await handler(event);

          // Assert: Should start a new conversation, not resume
          expect(response.statusCode).toBe(200);
          
          // Should get a welcome message for new conversation
          expect(response.body).toContain('Welcome to FirstLine');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should update TTL when resuming to prevent session expiration', async () => {
    await fc.assert(
      fc.asyncProperty(
        voiceConversationStateArbitrary,
        async (originalState) => {
          // Arrange: Set up original state with old TTL
          const originalContactId = originalState.contactId;
          const newContactId = fc.sample(fc.uuid(), 1)[0];
          const oldTTL = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now

          const voiceStateItem = removeUndefined({
            PK: `VOICE#${originalContactId}`,
            SK: 'STATE',
            Type: 'VoiceConversation',
            ContactId: originalContactId,
            PhoneNumber: originalState.phoneNumber,
            EncounterId: originalState.encounterId,
            Step: originalState.step,
            Demographics: originalState.demographics,
            Symptoms: originalState.symptoms,
            CurrentFollowupIndex: originalState.currentFollowupIndex,
            FollowupQuestions: originalState.followupQuestions,
            LastInteractionTimestamp: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
            TTL: oldTTL,
          });

          dynamoMock.on(GetItemCommand).callsFake((input) => {
            const pk = input.Key?.PK?.S;
            if (pk === `VOICE#${originalContactId}`) {
              return { Item: marshall(voiceStateItem, { removeUndefinedValues: true }) };
            }
            return {};
          });

          dynamoMock.on(PutItemCommand).resolves({});

          // Act: Resume the call
          const event = {
            Details: {
              ContactData: {
                ContactId: newContactId,
                CustomerEndpoint: {
                  Address: originalState.phoneNumber,
                  Type: 'TELEPHONE_NUMBER',
                },
                InitialContactId: originalContactId,
              },
              Parameters: {},
            },
            Name: 'ResumeCall',
          };

          const response = await handler(event);

          // Assert: TTL should be updated
          expect(response.statusCode).toBe(200);

          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          expect(putCalls.length).toBeGreaterThan(0);

          const savedItem = putCalls[putCalls.length - 1].args[0].input.Item;
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const savedState = unmarshall(savedItem!);

          // TTL should be updated to a new value (60 minutes from now)
          const expectedMinTTL = Math.floor(Date.now() / 1000) + 3500; // At least 58 minutes
          expect(savedState.TTL).toBeGreaterThanOrEqual(expectedMinTTL);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
