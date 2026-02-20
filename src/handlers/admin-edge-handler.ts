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

function getId(path: string): string | null {
  const match = path.match(/\/admin\/edge-devices\/([^/]+)/);
  return match ? match[1] : null;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;
  const id = getId(path);

  if (method === 'GET' && path.endsWith('/admin/edge-devices')) {
    return json(200, [
      { id: 'edge-001', name: 'Clinic Tablet A', status: 'online', location: 'Nairobi', lastSeen: new Date().toISOString() },
      { id: 'edge-002', name: 'Clinic Tablet B', status: 'offline', location: 'Kampala', lastSeen: new Date(Date.now() - 3600000).toISOString() },
    ]);
  }

  if (method === 'POST' && path.endsWith('/admin/edge-devices')) {
    const body = JSON.parse(event.body || '{}');
    return json(201, {
      id: `edge-${Date.now()}`,
      name: body.name || 'New Edge Device',
      status: 'online',
      location: body.location || 'Unknown',
      lastSeen: new Date().toISOString(),
    });
  }

  if (id && method === 'GET' && path.includes(`/admin/edge-devices/${id}`) && !path.endsWith('/logs')) {
    return json(200, {
      id,
      name: `Edge Device ${id}`,
      status: 'online',
      modelVersion: 'medgemma-2b-q4',
      lastSeen: new Date().toISOString(),
    });
  }

  if (id && method === 'PUT' && path.includes(`/admin/edge-devices/${id}`)) {
    const body = JSON.parse(event.body || '{}');
    return json(200, { id, message: 'Device updated', updates: body });
  }

  if (id && method === 'DELETE' && path.includes(`/admin/edge-devices/${id}`)) {
    return json(200, { id, message: 'Device removed' });
  }

  if (id && method === 'POST' && path.endsWith('/update')) {
    return json(200, { id, message: 'Update command sent', operationId: `op-${Date.now()}` });
  }

  if (id && method === 'POST' && path.endsWith('/restart')) {
    return json(200, { id, message: 'Restart command sent', operationId: `op-${Date.now()}` });
  }

  if (id && method === 'GET' && path.endsWith('/logs')) {
    return json(200, [
      { timestamp: new Date().toISOString(), level: 'info', message: 'Device heartbeat ok' },
      { timestamp: new Date().toISOString(), level: 'info', message: 'Model loaded successfully' },
    ]);
  }

  return json(404, { message: 'Not found' });
}

