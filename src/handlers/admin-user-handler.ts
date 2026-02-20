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
  const match = path.match(/\/admin\/users\/([^/]+)/);
  return match ? match[1] : null;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;
  const id = getId(path);

  if (method === 'GET' && path.endsWith('/admin/users')) {
    return json(200, [
      {
        id: 'user-001',
        name: 'Alice Clinician',
        email: 'alice@firstline.health',
        role: 'healthcare_worker',
        status: 'active',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'user-002',
        name: 'Bob Admin',
        email: 'bob.admin@firstline.health',
        role: 'admin',
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  if (method === 'POST' && path.endsWith('/admin/users')) {
    const body = JSON.parse(event.body || '{}');
    return json(201, {
      id: `user-${Date.now()}`,
      name: body.name || 'New User',
      email: body.email || '',
      role: body.role || 'healthcare_worker',
      status: 'active',
      createdAt: new Date().toISOString(),
    });
  }

  if (method === 'GET' && path.endsWith('/admin/users/roles')) {
    return json(200, ['admin', 'healthcare_worker']);
  }

  if (method === 'GET' && path.endsWith('/admin/users/activity')) {
    return json(200, [
      { id: 'act-001', userId: 'user-001', action: 'login', timestamp: new Date().toISOString() },
      { id: 'act-002', userId: 'user-002', action: 'updated settings', timestamp: new Date().toISOString() },
    ]);
  }

  if (id && method === 'GET' && path.endsWith(`/admin/users/${id}/activity`)) {
    return json(200, [{ id: 'act-100', userId: id, action: 'login', timestamp: new Date().toISOString() }]);
  }

  if (id && method === 'POST' && path.endsWith('/reset-password')) {
    return json(200, { id, message: 'Password reset initiated' });
  }

  if (id && method === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    return json(200, { id, message: 'User updated', updates: body });
  }

  if (id && method === 'DELETE') {
    return json(200, { id, message: 'User deleted' });
  }

  return json(404, { message: 'Not found' });
}

