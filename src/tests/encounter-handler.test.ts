import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../services/firestore.service');
jest.mock('../services/followup.service');

import { handler } from '../handlers/encounter-handler';
import { FirestoreService } from '../services/firestore.service';
import { FollowupService } from '../services/followup.service';

function event(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    ...overrides,
  } as APIGatewayProxyEvent;
}

describe('Encounter Handler (Firestore/GCP path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(FirestoreService.prototype, 'createEncounter').mockResolvedValue('enc-1');
    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: {
        EncounterId: 'enc-1',
        Channel: 'app',
      },
      followups: [],
      triage: null,
      referral: null,
      decision: null,
    } as any);
    jest.spyOn(FirestoreService.prototype, 'updateEncounter').mockResolvedValue(undefined);
    jest.spyOn(FirestoreService.prototype, 'put').mockResolvedValue(undefined);
    jest.spyOn(FirestoreService.prototype, 'generateEncounterPK').mockImplementation((id: string) => `ENC#${id}`);
    jest.spyOn(FirestoreService.prototype, 'generateFollowupSK').mockImplementation((seq: number) => `FOLLOWUP#${seq}`);
    jest.spyOn(FirestoreService.prototype, 'calculateTTL').mockReturnValue(Math.floor(Date.now() / 1000) + 60);
    jest.spyOn(FirestoreService.prototype, 'queryGSI1').mockResolvedValue([]);
    jest.spyOn(FirestoreService.prototype, 'generateGSI1PK').mockReturnValue('DATE#2026-01-01');
    jest.spyOn(FollowupService.prototype, 'getResponses').mockResolvedValue(['a'] as any);
  });

  it('creates an encounter with valid data', async () => {
    const res = await handler(
      event({
        httpMethod: 'POST',
        path: '/encounters',
        body: JSON.stringify({
          channel: 'app',
          age: 35,
          sex: 'M',
          location: 'Nairobi',
          symptoms: 'Fever and headache',
        }),
      })
    );

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).encounterId).toBeDefined();
    expect(FirestoreService.prototype.createEncounter).toHaveBeenCalled();
  });

  it('returns 400 when channel is invalid', async () => {
    const res = await handler(
      event({
        httpMethod: 'POST',
        path: '/encounters',
        body: JSON.stringify({ channel: 'invalid', age: 35, sex: 'M', location: 'Nairobi', symptoms: 'Fever' }),
      })
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when encounter does not exist', async () => {
    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: null,
      followups: [],
      triage: null,
      referral: null,
      decision: null,
    } as any);

    const res = await handler(
      event({
        httpMethod: 'GET',
        path: '/encounters/nonexistent',
        pathParameters: { id: 'nonexistent' },
      })
    );

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('adds symptoms to an existing encounter', async () => {
    const res = await handler(
      event({
        httpMethod: 'POST',
        path: '/encounters/enc-1/symptoms',
        pathParameters: { id: 'enc-1' },
        body: JSON.stringify({ symptoms: 'Severe headache and dizziness' }),
      })
    );

    expect(res.statusCode).toBe(200);
    expect(FirestoreService.prototype.updateEncounter).toHaveBeenCalledWith(
      'enc-1',
      expect.objectContaining({ Symptoms: 'Severe headache and dizziness', Status: 'in_progress' })
    );
  });

  it('adds follow-up response', async () => {
    const res = await handler(
      event({
        httpMethod: 'POST',
        path: '/encounters/enc-1/followup',
        pathParameters: { id: 'enc-1' },
        body: JSON.stringify({ question: 'How long?', response: '3 days' }),
      })
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('successfully');
    expect(FirestoreService.prototype.put).toHaveBeenCalled();
  });

  it('returns 400 when follow-up question missing', async () => {
    const res = await handler(
      event({
        httpMethod: 'POST',
        path: '/encounters/enc-1/followup',
        pathParameters: { id: 'enc-1' },
        body: JSON.stringify({ response: '3 days' }),
      })
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 with CREATE_FAILED when creation fails', async () => {
    jest.spyOn(FirestoreService.prototype, 'createEncounter').mockRejectedValue(new Error('Firestore write failed'));

    const res = await handler(
      event({
        httpMethod: 'POST',
        path: '/encounters',
        body: JSON.stringify({ channel: 'app', age: 35, sex: 'M', location: 'Nairobi', symptoms: 'Fever' }),
      })
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('CREATE_FAILED');
    expect(body.error.details).toContain('Firestore write failed');
  });
});
