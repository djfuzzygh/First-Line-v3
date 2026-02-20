# CORS Issue - Fixed! ✅

## Problem
The clinician app at https://d1ix7s8ou6utij.cloudfront.net was getting CORS errors when trying to access the API:

```
Access to XMLHttpRequest at 'https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/auth/me' 
from origin 'https://d1ix7s8ou6utij.cloudfront.net' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Root Cause
API Gateway was configured with CORS for successful responses, but when requests failed (401 Unauthorized, 403 Forbidden, etc.), the Gateway Responses didn't include CORS headers.

## Solution
Added Gateway Responses to API Gateway with CORS headers for error cases:

1. **Unauthorized (401)** - When JWT token is invalid/missing
2. **Access Denied (403)** - When authorization fails
3. **Default 4XX** - All other client errors
4. **Default 5XX** - All server errors

### Code Changes
Updated `infrastructure/lib/firstline-stack.ts`:

```typescript
// Add CORS headers to Gateway Responses for error cases
api.addGatewayResponse('Unauthorized', {
  type: apigateway.ResponseType.UNAUTHORIZED,
  statusCode: '401',
  responseHeaders: {
    'Access-Control-Allow-Origin': "'*'",
    'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
  },
});

// Similar for AccessDenied, Default4XX, Default5XX
```

## Verification

### Test CORS Preflight (OPTIONS)
```bash
curl -X OPTIONS https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/auth/me \
  -H "Origin: https://d1ix7s8ou6utij.cloudfront.net" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization"
```

**Result**: ✅ Returns CORS headers
```
access-control-allow-origin: *
access-control-allow-headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
access-control-allow-methods: OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD
```

### Test Actual Request
```bash
curl -X POST https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://d1ix7s8ou6utij.cloudfront.net" \
  -d '{"email":"test@test.com","password":"Test123!"}'
```

**Result**: ✅ Returns CORS headers
```
access-control-allow-origin: *
```

## Status
✅ **FIXED** - Deployed at 11:46 PM on February 17, 2026

## Next Steps
1. Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
2. Reload the clinician app: https://d1ix7s8ou6utij.cloudfront.net
3. Try logging in again

The CORS issue should now be resolved!

## Technical Details

### What is CORS?
Cross-Origin Resource Sharing (CORS) is a security feature that prevents web pages from making requests to a different domain than the one that served the page.

### Why Did This Happen?
- The clinician app is served from: `https://d1ix7s8ou6utij.cloudfront.net`
- The API is at: `https://wsvwbxo112.execute-api.us-east-1.amazonaws.com`
- These are different origins, so CORS is required

### How Does It Work Now?
1. Browser sends OPTIONS preflight request
2. API Gateway returns CORS headers allowing the request
3. Browser sends actual request (GET, POST, etc.)
4. API Gateway returns response with CORS headers
5. Browser allows the response to be read by the app

### CORS Headers Explained
- `Access-Control-Allow-Origin: *` - Allow requests from any origin
- `Access-Control-Allow-Methods` - Which HTTP methods are allowed
- `Access-Control-Allow-Headers` - Which headers can be sent

## Deployment Info
- **Stack**: FirstLineStack-dev
- **Region**: us-east-1
- **Deployment Time**: ~3 minutes
- **Changes**: API Gateway configuration only (no Lambda changes)
