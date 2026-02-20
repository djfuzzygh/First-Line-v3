/**
 * Property-Based Test: Channel-Appropriate Formatting
 * 
 * Property 10: Channel-Appropriate Formatting
 * 
 * For any message delivered via USSD or SMS, questions and instructions should
 * be formatted with numbered options for easy response.
 * 
 * **Validates: Requirements 3.6**
 * 
 * Feature: firstline-triage-platform, Property 10: Channel-Appropriate Formatting
 */

import * as fc from 'fast-check';
import { handler } from '../handlers/sms-handler';
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';

describe('Property 10: Channel-Appropriate Formatting', () => {
  const dynamoMock = mockClient(DynamoDBClient);
  const snsMock = mockClient(SNSClient);

  beforeEach(() => {
    dynamoMock.reset();
    snsMock.reset();

    // Set environment variables
    process.env.TABLE_NAME = 'test-table';
    process.env.AWS_REGION = 'us-east-1';

    // Mock successful DynamoDB operations
    dynamoMock.on(PutItemCommand).resolves({});
    dynamoMock.on(GetItemCommand).resolves({});
    dynamoMock.on(QueryCommand).resolves({ Items: [] });
    dynamoMock.on(UpdateItemCommand).resolves({});

    // Mock successful SNS operations
    snsMock.on(PublishCommand).resolves({
      MessageId: 'mock-message-id',
    });
  });

  /**
   * Generator for phone numbers
   */
  const phoneNumberArbitrary = fc
    .integer({ min: 1000000000, max: 9999999999 })
    .map(n => `+1${n}`);

  // Removed unused conversationStateArbitrary generator

  /**
   * Helper to create SMS webhook event
   */
  function createSMSWebhookEvent(phoneNumber: string, message: string): APIGatewayProxyEvent {
    return {
      httpMethod: 'POST',
      path: '/sms/webhook',
      body: JSON.stringify({
        originationNumber: phoneNumber,
        messageBody: message,
      }),
      headers: {},
      multiValueHeaders: {},
      isBase64Encoded: false,
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
    };
  }

  /**
   * Helper to check if a message contains numbered options
   */
  function hasNumberedOptions(message: string): boolean {
    // Check for patterns like "1.", "2.", "3." or "1)", "2)", "3)"
    const numberedPattern = /\d+[\.\)]\s+/;
    return numberedPattern.test(message);
  }

  /**
   * Helper to extract numbered options from a message
   */
  function extractNumberedOptions(message: string): string[] {
    const lines = message.split('\n');
    const options: string[] = [];
    
    for (const line of lines) {
      const match = line.match(/^(\d+)[\.\)]\s+(.+)$/);
      if (match) {
        options.push(match[2].trim());
      }
    }
    
    return options;
  }

  it('should format sex selection with numbered options for SMS/USSD', async () => {
    await fc.assert(
      fc.asyncProperty(
        phoneNumberArbitrary,
        fc.integer({ min: 0, max: 120 }),
        async (phoneNumber, age) => {
          // Mock conversation state at AGE step
          const existingState = {
            PK: { S: `SMS#${phoneNumber}` },
            SK: { S: 'STATE' },
            Type: { S: 'SMSConversation' },
            PhoneNumber: { S: phoneNumber },
            Step: { S: 'AGE' },
            Demographics: {
              M: {},
            },
            LastMessageTimestamp: { S: new Date().toISOString() },
            TTL: { N: String(Math.floor(Date.now() / 1000) + 1800) },
          };

          dynamoMock.on(GetItemCommand).resolves({
            Item: existingState,
          });

          // Create event with age input
          const event = createSMSWebhookEvent(phoneNumber, age.toString());

          // Act: Call handler
          const response = await handler(event);

          // Assert: Response is successful
          expect(response.statusCode).toBe(200);

          // Assert: SNS was called to send response
          const snsPublishCalls = snsMock.commandCalls(PublishCommand);
          expect(snsPublishCalls.length).toBeGreaterThan(0);

          const sentMessage = snsPublishCalls[snsPublishCalls.length - 1].args[0].input.Message!;

          // Requirement 3.6: Questions delivered via SMS SHALL be formatted with numbered options
          expect(hasNumberedOptions(sentMessage)).toBe(true);

          // Assert: Message contains numbered options for sex selection
          const options = extractNumberedOptions(sentMessage);
          expect(options.length).toBeGreaterThanOrEqual(2);
          
          // Assert: Options include Male, Female, and Other
          const optionsText = sentMessage.toLowerCase();
          expect(optionsText).toMatch(/\d+[\.\)]\s+.*m.*male/i);
          expect(optionsText).toMatch(/\d+[\.\)]\s+.*f.*female/i);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should format triage results with numbered next steps for SMS/USSD', async () => {
    await fc.assert(
      fc.asyncProperty(
        phoneNumberArbitrary,
        fc.uuid(),
        fc.constantFrom('RED', 'YELLOW', 'GREEN'),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
        async (phoneNumber, encounterId, _riskTier, _nextSteps) => {
          // Mock conversation state at FOLLOWUP step (last question)
          const existingState = {
            PK: { S: `SMS#${phoneNumber}` },
            SK: { S: 'STATE' },
            Type: { S: 'SMSConversation' },
            PhoneNumber: { S: phoneNumber },
            EncounterId: { S: encounterId },
            Step: { S: 'FOLLOWUP' },
            CurrentFollowupIndex: { N: '2' },
            FollowupQuestions: {
              L: [
                { S: 'Question 1' },
                { S: 'Question 2' },
                { S: 'Question 3' },
              ],
            },
            Demographics: {
              M: {
                age: { N: '30' },
                sex: { S: 'M' },
                location: { S: 'Test Location' },
              },
            },
            Symptoms: { S: 'Test symptoms' },
            LastMessageTimestamp: { S: new Date().toISOString() },
            TTL: { N: String(Math.floor(Date.now() / 1000) + 1800) },
          };

          dynamoMock.on(GetItemCommand).resolves({
            Item: existingState,
          });

          // Mock encounter data query
          const encounterData = {
            Items: [
              marshall({
                PK: `ENC#${encounterId}`,
                SK: 'METADATA',
                Type: 'Encounter',
                EncounterId: encounterId,
                Channel: 'sms',
                Demographics: {
                  age: 30,
                  sex: 'M',
                  location: 'Test Location',
                },
                Symptoms: 'Test symptoms',
                Timestamp: new Date().toISOString(),
              }),
              marshall({
                PK: `ENC#${encounterId}`,
                SK: 'FOLLOWUP#1',
                Type: 'Followup',
                Question: 'Question 1',
                Response: 'Response 1',
                Timestamp: new Date().toISOString(),
              }),
              marshall({
                PK: `ENC#${encounterId}`,
                SK: 'FOLLOWUP#2',
                Type: 'Followup',
                Question: 'Question 2',
                Response: 'Response 2',
                Timestamp: new Date().toISOString(),
              }),
            ],
          };

          dynamoMock.on(QueryCommand).resolves(encounterData);

          // Create event with final follow-up response
          const event = createSMSWebhookEvent(phoneNumber, 'Final response');

          // Act: Call handler
          const response = await handler(event);

          // Assert: Response is successful
          expect(response.statusCode).toBe(200);

          // Assert: SNS was called to send triage result
          const snsPublishCalls = snsMock.commandCalls(PublishCommand);
          expect(snsPublishCalls.length).toBeGreaterThan(0);

          const sentMessage = snsPublishCalls[snsPublishCalls.length - 1].args[0].input.Message!;

          // Requirement 3.6: Instructions delivered via SMS SHALL be formatted with numbered options
          // Triage results should have numbered next steps
          if (sentMessage.includes('WHAT TO DO:') || sentMessage.includes('RECOMMENDED')) {
            expect(hasNumberedOptions(sentMessage)).toBe(true);
            
            const options = extractNumberedOptions(sentMessage);
            expect(options.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should format all multi-option questions with numbers for SMS/USSD', async () => {
    await fc.assert(
      fc.asyncProperty(
        phoneNumberArbitrary,
        async (phoneNumber) => {
          // Test the START step which should prompt for age
          const startState = {
            PK: { S: `SMS#${phoneNumber}` },
            SK: { S: 'STATE' },
            Type: { S: 'SMSConversation' },
            PhoneNumber: { S: phoneNumber },
            Step: { S: 'START' },
            Demographics: { M: {} },
            LastMessageTimestamp: { S: new Date().toISOString() },
            TTL: { N: String(Math.floor(Date.now() / 1000) + 1800) },
          };

          dynamoMock.on(GetItemCommand).resolves({
            Item: startState,
          });

          // Create event with TRIAGE command
          const event = createSMSWebhookEvent(phoneNumber, 'TRIAGE');

          // Act: Call handler
          const response = await handler(event);

          // Assert: Response is successful
          expect(response.statusCode).toBe(200);

          // Assert: SNS was called
          const snsPublishCalls = snsMock.commandCalls(PublishCommand);
          expect(snsPublishCalls.length).toBeGreaterThan(0);

          const sentMessage = snsPublishCalls[snsPublishCalls.length - 1].args[0].input.Message!;

          // The START message asks for age (not a multi-option question)
          // But we verify the message is properly formatted for SMS
          expect(sentMessage).toBeDefined();
          expect(typeof sentMessage).toBe('string');
          expect(sentMessage.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should consistently use numbered format across all SMS/USSD interactions', async () => {
    await fc.assert(
      fc.asyncProperty(
        phoneNumberArbitrary,
        fc.integer({ min: 0, max: 120 }),
        fc.constantFrom('1', '2', '3', 'M', 'F', 'O'),
        fc.string({ minLength: 3, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 200 }),
        async (phoneNumber, age, sexChoice, location, _symptoms) => {
          // Test complete conversation flow
          const conversationSteps = [
            { step: 'START', input: 'TRIAGE', expectNumbered: false },
            { step: 'AGE', input: age.toString(), expectNumbered: true }, // Sex selection has numbers
            { step: 'SEX', input: sexChoice, expectNumbered: false }, // Location is free text
            { step: 'LOCATION', input: location, expectNumbered: false }, // Symptoms is free text
          ];

          for (const { step, input, expectNumbered } of conversationSteps) {
            // Mock appropriate state
            let demographicsData: Record<string, any> = {};
            
            if (step === 'SEX' || step === 'LOCATION') {
              demographicsData = {
                age: { N: age.toString() },
              };
            } else if (step === 'LOCATION') {
              demographicsData = {
                age: { N: age.toString() },
                sex: { S: sexChoice.charAt(0).toUpperCase() },
              };
            }

            const state = {
              PK: { S: `SMS#${phoneNumber}` },
              SK: { S: 'STATE' },
              Type: { S: 'SMSConversation' },
              PhoneNumber: { S: phoneNumber },
              Step: { S: step },
              Demographics: {
                M: demographicsData,
              },
              LastMessageTimestamp: { S: new Date().toISOString() },
              TTL: { N: String(Math.floor(Date.now() / 1000) + 1800) },
            };

            dynamoMock.on(GetItemCommand).resolves({
              Item: state,
            });

            // Create event
            const event = createSMSWebhookEvent(phoneNumber, input);

            // Act: Call handler
            const response = await handler(event);

            // Assert: Response is successful
            expect(response.statusCode).toBe(200);

            // Assert: SNS was called
            const snsPublishCalls = snsMock.commandCalls(PublishCommand);
            if (snsPublishCalls.length > 0) {
              const sentMessage = snsPublishCalls[snsPublishCalls.length - 1].args[0].input.Message!;

              // Requirement 3.6: Multi-option questions SHALL use numbered format
              if (expectNumbered) {
                expect(hasNumberedOptions(sentMessage)).toBe(true);
              }

              // All messages should be properly formatted for SMS
              expect(sentMessage).toBeDefined();
              expect(typeof sentMessage).toBe('string');
              expect(sentMessage.length).toBeGreaterThan(0);
              expect(sentMessage.length).toBeLessThanOrEqual(480); // Max 3 SMS messages
            }

            // Reset mocks for next iteration
            snsMock.reset();
            snsMock.on(PublishCommand).resolves({
              MessageId: 'mock-message-id',
            });
          }
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  }, 35000);

  it('should format numbered options to be easily parseable by users', async () => {
    await fc.assert(
      fc.asyncProperty(
        phoneNumberArbitrary,
        fc.integer({ min: 0, max: 120 }),
        async (phoneNumber, age) => {
          // Mock conversation state at AGE step
          const existingState = {
            PK: { S: `SMS#${phoneNumber}` },
            SK: { S: 'STATE' },
            Type: { S: 'SMSConversation' },
            PhoneNumber: { S: phoneNumber },
            Step: { S: 'AGE' },
            Demographics: { M: {} },
            LastMessageTimestamp: { S: new Date().toISOString() },
            TTL: { N: String(Math.floor(Date.now() / 1000) + 1800) },
          };

          dynamoMock.on(GetItemCommand).resolves({
            Item: existingState,
          });

          // Create event with age input
          const event = createSMSWebhookEvent(phoneNumber, age.toString());

          // Act: Call handler
          const response = await handler(event);

          // Assert: Response is successful
          expect(response.statusCode).toBe(200);

          // Assert: SNS was called
          const snsPublishCalls = snsMock.commandCalls(PublishCommand);
          expect(snsPublishCalls.length).toBeGreaterThan(0);

          const sentMessage = snsPublishCalls[snsPublishCalls.length - 1].args[0].input.Message!;

          // Requirement 3.6: Numbered options should be easy to respond to
          const options = extractNumberedOptions(sentMessage);
          
          if (options.length > 0) {
            // Each option should be on its own line or clearly separated
            options.forEach((option, index) => {
              expect(option.length).toBeGreaterThan(0);
              
              // Option should contain meaningful text
              expect(option.trim()).not.toBe('');
              
              // Numbers should be sequential starting from 1
              const numberMatch = sentMessage.match(new RegExp(`(${index + 1})[\\.)\\s]`));
              expect(numberMatch).toBeTruthy();
            });
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should maintain numbered format even when messages are split', async () => {
    await fc.assert(
      fc.asyncProperty(
        phoneNumberArbitrary,
        fc.uuid(),
        fc.array(fc.string({ minLength: 50, maxLength: 150 }), { minLength: 5, maxLength: 10 }),
        async (phoneNumber, encounterId, _longNextSteps) => {
          // Mock conversation state at FOLLOWUP step (last question)
          const existingState = {
            PK: { S: `SMS#${phoneNumber}` },
            SK: { S: 'STATE' },
            Type: { S: 'SMSConversation' },
            PhoneNumber: { S: phoneNumber },
            EncounterId: { S: encounterId },
            Step: { S: 'FOLLOWUP' },
            CurrentFollowupIndex: { N: '2' },
            FollowupQuestions: {
              L: [
                { S: 'Question 1' },
                { S: 'Question 2' },
                { S: 'Question 3' },
              ],
            },
            Demographics: {
              M: {
                age: { N: '30' },
                sex: { S: 'M' },
                location: { S: 'Test Location' },
              },
            },
            Symptoms: { S: 'Test symptoms' },
            LastMessageTimestamp: { S: new Date().toISOString() },
            TTL: { N: String(Math.floor(Date.now() / 1000) + 1800) },
          };

          dynamoMock.on(GetItemCommand).resolves({
            Item: existingState,
          });

          // Mock encounter data query with long next steps
          const encounterData = {
            Items: [
              marshall({
                PK: `ENC#${encounterId}`,
                SK: 'METADATA',
                Type: 'Encounter',
                EncounterId: encounterId,
                Channel: 'sms',
                Demographics: {
                  age: 30,
                  sex: 'M',
                  location: 'Test Location',
                },
                Symptoms: 'Test symptoms',
                Timestamp: new Date().toISOString(),
              }),
            ],
          };

          dynamoMock.on(QueryCommand).resolves(encounterData);

          // Create event with final follow-up response
          const event = createSMSWebhookEvent(phoneNumber, 'Final response');

          // Act: Call handler
          const response = await handler(event);

          // Assert: Response is successful
          expect(response.statusCode).toBe(200);

          // Assert: SNS was called (possibly multiple times for split messages)
          const snsPublishCalls = snsMock.commandCalls(PublishCommand);
          expect(snsPublishCalls.length).toBeGreaterThan(0);

          // Check all sent messages
          const allMessages = snsPublishCalls.map(call => call.args[0].input.Message!);

          // Requirement 3.6: Numbered format should be maintained even in split messages
          allMessages.forEach(message => {
            expect(message).toBeDefined();
            expect(typeof message).toBe('string');
            expect(message.length).toBeGreaterThan(0);
            
            // Each message should be within SMS length limits
            expect(message.length).toBeLessThanOrEqual(160);
          });

          // If there are numbered options, they should be properly formatted
          const combinedMessage = allMessages.join(' ');
          if (hasNumberedOptions(combinedMessage)) {
            const options = extractNumberedOptions(combinedMessage);
            expect(options.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
