import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../services/firestore.service');
jest.mock('../services/followup.service');
jest.mock('../services/triage.service');

import { handler } from '../handlers/sms-handler';
import { FirestoreService } from '../services/firestore.service';
import { FollowupService } from '../services/followup.service';
import { TriageService } from '../services/triage.service';

function event(body: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/sms/webhook',
    body: JSON.stringify(body),
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

describe('SMS handler (Firestore/GCP path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(FirestoreService.prototype, 'get').mockResolvedValue(null);
    jest.spyOn(FirestoreService.prototype, 'put').mockResolvedValue(undefined);
    jest.spyOn(FirestoreService.prototype, 'createEncounter').mockResolvedValue('enc-1');
    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: {
        EncounterId: 'enc-1',
        Channel: 'sms',
        Demographics: { age: 30, sex: 'M', location: 'Kampala' },
        Symptoms: 'Fever',
      },
      followups: [],
      triage: null,
    } as any);

    jest.spyOn(FollowupService.prototype, 'generateQuestions').mockResolvedValue([
      'How long have you had fever?',
      'Any chest pain?',
      'Any medication taken?',
    ]);
    jest.spyOn(FollowupService.prototype, 'storeQuestions').mockResolvedValue([] as any);
    jest.spyOn(FollowupService.prototype, 'storeResponse').mockResolvedValue(undefined);
    jest.spyOn(FollowupService.prototype, 'getResponses').mockResolvedValue(['2 days', 'No', 'Paracetamol']);

    jest.spyOn(TriageService.prototype, 'performTriage').mockResolvedValue({
      RiskTier: 'YELLOW',
      RecommendedNextSteps: ['Seek clinic review within 24 hours'],
      Disclaimer: 'This is not a diagnosis.',
      DangerSigns: [],
    } as any);
  });

  it('returns 400 for invalid payload', async () => {
    const res = await handler(event({}));
    expect(res.statusCode).toBe(400);
  });

  it('starts conversation from TRIAGE command', async () => {
    const res = await handler(event({ originationNumber: '+1234567890', messageBody: 'TRIAGE' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reply).toContain('Enter your age');
    expect(FirestoreService.prototype.put).toHaveBeenCalled();
  });

  it('moves from AGE to SEX with numbered options', async () => {
    jest.spyOn(FirestoreService.prototype, 'get').mockResolvedValue({
      PK: 'SMS#+1234567890',
      SK: 'STATE',
      Type: 'SMSConversation',
      PhoneNumber: '+1234567890',
      Step: 'AGE',
      Demographics: {},
      LastMessageTimestamp: new Date().toISOString(),
      TTL: Math.floor(Date.now() / 1000) + 1800,
    } as any);

    const res = await handler(event({ originationNumber: '+1234567890', messageBody: '35' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reply).toContain('1. Male');
    expect(body.reply).toContain('2. Female');
  });

  it('creates encounter and asks first follow-up question', async () => {
    jest.spyOn(FirestoreService.prototype, 'get').mockResolvedValue({
      PK: 'SMS#+1234567890',
      SK: 'STATE',
      Type: 'SMSConversation',
      PhoneNumber: '+1234567890',
      Step: 'SYMPTOMS',
      Demographics: { age: 35, sex: 'M', location: 'Kampala' },
      LastMessageTimestamp: new Date().toISOString(),
      TTL: Math.floor(Date.now() / 1000) + 1800,
    } as any);

    const res = await handler(
      event({ originationNumber: '+1234567890', messageBody: 'Fever and cough for 2 days' })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reply).toContain('Question 1/3');
    expect(FirestoreService.prototype.createEncounter).toHaveBeenCalled();
  });

  it('completes triage after last follow-up', async () => {
    jest.spyOn(FirestoreService.prototype, 'get').mockResolvedValue({
      PK: 'SMS#+1234567890',
      SK: 'STATE',
      Type: 'SMSConversation',
      PhoneNumber: '+1234567890',
      Step: 'FOLLOWUP',
      EncounterId: 'enc-1',
      CurrentFollowupIndex: 2,
      FollowupQuestions: ['Q1', 'Q2', 'Q3'],
      Demographics: { age: 35, sex: 'M', location: 'Kampala' },
      Symptoms: 'Fever',
      LastMessageTimestamp: new Date().toISOString(),
      TTL: Math.floor(Date.now() / 1000) + 1800,
    } as any);

    const res = await handler(event({ originationNumber: '+1234567890', messageBody: 'final answer' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reply).toContain('TRIAGE RESULT: YELLOW');
    expect(TriageService.prototype.performTriage).toHaveBeenCalled();
  });

  it('supports RESTART from any state', async () => {
    jest.spyOn(FirestoreService.prototype, 'get').mockResolvedValue({
      PK: 'SMS#+1234567890',
      SK: 'STATE',
      Type: 'SMSConversation',
      PhoneNumber: '+1234567890',
      Step: 'FOLLOWUP',
      EncounterId: 'enc-1',
      LastMessageTimestamp: new Date().toISOString(),
      TTL: Math.floor(Date.now() / 1000) + 1800,
      Demographics: { age: 30, sex: 'F', location: 'Kampala' },
    } as any);

    const res = await handler(event({ originationNumber: '+1234567890', messageBody: 'RESTART' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reply).toContain('restarted');
  });
});
