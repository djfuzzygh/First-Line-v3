import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Request, Response } from 'express';

type ExpressStyleHandler = (req: Request, res: Response) => Promise<void> | void;
type DualHandler = {
  (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>;
  (req: Request, res: Response): Promise<void>;
};

interface ResponseState {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function isApiGatewayEvent(input: unknown): input is APIGatewayProxyEvent {
  if (!input || typeof input !== 'object') {
    return false;
  }
  const candidate = input as { httpMethod?: unknown; path?: unknown };
  return typeof candidate.httpMethod === 'string' && typeof candidate.path === 'string';
}

function toRequest(event: APIGatewayProxyEvent): Request {
  let parsedBody: unknown = {};
  if (event.body) {
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      parsedBody = {};
    }
  }

  const req = {
    method: event.httpMethod,
    path: event.path,
    params: event.pathParameters || {},
    query: event.queryStringParameters || {},
    headers: event.headers || {},
    body: parsedBody,
  } as unknown as Request;

  return req;
}

function createResponse(): { res: Response; state: ResponseState } {
  const state: ResponseState = {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '',
  };

  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      state.body = JSON.stringify(payload);
      if (!state.headers['Content-Type']) {
        state.headers['Content-Type'] = 'application/json';
      }
      return this;
    },
    send(payload: unknown) {
      if (typeof payload === 'string') {
        state.body = payload;
        if (!state.headers['Content-Type']) {
          state.headers['Content-Type'] = 'text/plain';
        }
      } else {
        state.body = JSON.stringify(payload);
        if (!state.headers['Content-Type']) {
          state.headers['Content-Type'] = 'application/json';
        }
      }
      return this;
    },
    set(name: string, value: string) {
      state.headers[name] = value;
      return this;
    },
    header(name: string, value: string) {
      state.headers[name] = value;
      return this;
    },
    sendStatus(code: number) {
      state.statusCode = code;
      state.body = '';
      return this;
    },
  } as unknown as Response;

  return { res, state };
}

export function asDualHandler(handler: ExpressStyleHandler) {
  const wrapped = async (
    reqOrEvent: Request | APIGatewayProxyEvent,
    maybeRes?: Response
  ): Promise<void | APIGatewayProxyResult> => {
    if (!maybeRes && isApiGatewayEvent(reqOrEvent)) {
      const req = toRequest(reqOrEvent);
      const { res, state } = createResponse();
      await handler(req, res);
      return {
        statusCode: state.statusCode,
        headers: state.headers,
        body: state.body,
      };
    }

    await handler(reqOrEvent as Request, maybeRes as Response);
    return;
  };

  return wrapped as DualHandler;
}
