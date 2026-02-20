import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Security headers to add to all responses
 */
export const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Add security headers to response
 */
export function addSecurityHeaders(response: APIGatewayProxyResult): APIGatewayProxyResult {
  return {
    ...response,
    headers: {
      ...response.headers,
      ...SECURITY_HEADERS,
    },
  };
}

/**
 * Basic input sanitization
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  
  // Remove potential XSS vectors
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

/**
 * Rate limiting check (simple in-memory implementation)
 * For production, use DynamoDB or Redis
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

/**
 * Validate request body size
 */
export function validateBodySize(body: string, maxSizeKb: number = 100): boolean {
  const sizeKb = Buffer.byteLength(body, 'utf8') / 1024;
  return sizeKb <= maxSizeKb;
}

/**
 * Extract IP address from event
 */
export function getClientIp(event: APIGatewayProxyEvent): string {
  return (
    event.headers['X-Forwarded-For']?.split(',')[0] ||
    event.requestContext.identity.sourceIp ||
    'unknown'
  );
}

/**
 * Validate JSON structure
 */
export function parseAndValidateJSON<T>(body: string): T {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error('Invalid JSON format');
  }
}
