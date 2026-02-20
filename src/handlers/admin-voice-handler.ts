import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;

  if (method === 'GET' && path.includes('/admin/voice/config')) {
    return json(200, {
      provider: 'twilio',
      enabled: true,
      language: 'en-US',
      ttsVoice: 'female',
      maxCallDuration: 180,
      recordingEnabled: true,
    });
  }

  if (method === 'PUT' && path.includes('/admin/voice/config')) {
    const body = JSON.parse(event.body || '{}');
    return json(200, { message: 'Voice configuration updated', config: body });
  }

  if (method === 'POST' && path.includes('/admin/voice/test-call')) {
    const body = JSON.parse(event.body || '{}');
    return json(200, {
      message: 'Test call queued',
      phoneNumber: body.phoneNumber || '',
      callId: `call-${Date.now()}`,
    });
  }

  if (method === 'GET' && path.includes('/admin/voice/phone-numbers')) {
    return json(200, [
      { id: 'num-001', number: '+12025550123', country: 'US', status: 'active' },
      { id: 'num-002', number: '+254700123456', country: 'KE', status: 'active' },
    ]);
  }

  if (method === 'POST' && path.includes('/admin/voice/phone-numbers')) {
    const body = JSON.parse(event.body || '{}');
    return json(201, {
      id: `num-${Date.now()}`,
      number: body.number || '',
      country: body.country || 'US',
      status: 'active',
    });
  }

  return json(404, { message: 'Not found' });
}

