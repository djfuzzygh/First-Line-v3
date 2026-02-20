/**
 * Temporary stub for admin handlers
 * These will be properly implemented after core deployment
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export async function handler(
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  return {
    statusCode: 501,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      message: 'Admin functionality coming soon',
      note: 'Core triage system is fully functional. Admin dashboards will be enabled in the next update.',
    }),
  };
}
