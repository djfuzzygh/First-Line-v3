# Deployment Guide

## Prerequisites

### Required Tools
- Node.js 20.x or later
- npm or yarn
- AWS CLI configured
- AWS CDK CLI: `npm install -g aws-cdk`
- Git

### AWS Account Setup
1. Create an AWS account (if you don't have one)
2. Create an IAM user with appropriate permissions
3. Configure AWS CLI with credentials:
   ```bash
   aws configure
   ```

### Required AWS Permissions
Your IAM user needs permissions for:
- Lambda (create, update, invoke)
- API Gateway (create, update)
- DynamoDB (create, update, read, write)
- S3 (create, read, write)
- SNS (create, publish)
- CloudWatch (create dashboards, alarms)
- IAM (create roles, policies)
- CloudFormation (create, update stacks)

## Environment Setup

### 1. Backend Configuration

Create environment variables (or use AWS Secrets Manager):

```bash
# Required
export AWS_REGION=us-east-1
export JWT_SECRET=your-secure-random-string-here

# Optional
export BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

### 2. GitHub Secrets (for CI/CD)

Add these secrets to your GitHub repository:

**Development/Staging**:
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `JWT_SECRET` - JWT signing secret
- `BEDROCK_MODEL_ID` - Bedrock model ID (optional)

**Production** (separate credentials recommended):
- `AWS_ACCESS_KEY_ID_PROD`
- `AWS_SECRET_ACCESS_KEY_PROD`
- `JWT_SECRET_PROD`

### 3. Frontend Configuration

**Web Dashboard** (`web-dashboard/.env`):
```env
VITE_API_URL=https://your-api-url.execute-api.us-east-1.amazonaws.com/v1
VITE_SENTRY_DSN=your-sentry-dsn-here (optional)
```

**Mobile App** (`mobile-app/.env`):
```env
EXPO_PUBLIC_API_URL=https://your-api-url.execute-api.us-east-1.amazonaws.com/v1
EXPO_PUBLIC_SENTRY_DSN=your-sentry-dsn-here (optional)
```

## Deployment Steps

### Option 1: Manual Deployment

#### Step 1: Install Dependencies

```bash
# Root dependencies
npm install

# Infrastructure dependencies
cd infrastructure
npm install
cd ..

# Web dashboard dependencies
cd web-dashboard
npm install
cd ..

# Mobile app dependencies
cd mobile-app
npm install
cd ..
```

#### Step 2: Run Tests

```bash
# Backend tests
npm test

# Web dashboard build test
cd web-dashboard
npm run build
cd ..

# Mobile app type check
cd mobile-app
npx tsc --noEmit
cd ..
```

#### Step 3: Deploy Infrastructure

```bash
cd infrastructure

# Bootstrap CDK (first time only)
npx cdk bootstrap

# Deploy stack
npx cdk deploy

# Save the API URL from outputs
```

#### Step 4: Update Frontend Configuration

Update the API URL in your frontend `.env` files with the deployed API Gateway URL.

#### Step 5: Deploy Web Dashboard

```bash
cd web-dashboard

# Build
npm run build

# Deploy to S3 + CloudFront (manual)
# Or use Vercel/Netlify:
# vercel deploy
# netlify deploy
```

#### Step 6: Build Mobile App

```bash
cd mobile-app

# For development
npm start

# For production build
eas build --platform all
```

### Option 2: Automated Deployment (CI/CD)

#### Step 1: Configure GitHub Secrets

Add all required secrets to your GitHub repository (see Environment Setup above).

#### Step 2: Push to Branch

```bash
# Deploy to dev
git checkout develop
git push origin develop

# Deploy to staging/production
git checkout main
git push origin main
```

The CI/CD pipeline will automatically:
1. Run tests
2. Build applications
3. Deploy infrastructure
4. Output deployment URLs

## Post-Deployment

### 1. Verify Deployment

```bash
# Test health endpoint
curl https://your-api-url/v1/health

# Expected response:
# {"status":"healthy","timestamp":"..."}
```

### 2. Create First User

```bash
# Using curl
curl -X POST https://your-api-url/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123",
    "name": "Admin User",
    "role": "admin"
  }'
```

### 3. Test Login

```bash
curl -X POST https://your-api-url/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123"
  }'
```

### 4. Access Web Dashboard

1. Navigate to your web dashboard URL
2. Login with the credentials you created
3. Verify all pages load correctly

### 5. Test Mobile App

1. Update API URL in mobile app
2. Run `npm start` or install built app
3. Test login and encounter creation

## Monitoring

### CloudWatch Dashboard

Access your CloudWatch dashboard:
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=FirstLine-Triage-Platform
```

### CloudWatch Alarms

View configured alarms:
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#alarmsV2:
```

### Lambda Logs

View Lambda function logs:
```bash
# List log groups
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/FirstLine

# Tail logs
aws logs tail /aws/lambda/FirstLineStack-EncounterHandler --follow
```

## Troubleshooting

### Common Issues

#### 1. CDK Bootstrap Error
```bash
# Solution: Bootstrap your AWS account
cd infrastructure
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

#### 2. Lambda Timeout
- Check CloudWatch logs for errors
- Increase timeout in `infrastructure/lib/firstline-stack.ts`
- Verify DynamoDB table exists

#### 3. CORS Errors
- Verify API Gateway CORS configuration
- Check that frontend is using correct API URL
- Ensure Authorization header is included

#### 4. Authentication Fails
- Verify JWT_SECRET is set correctly
- Check token expiration (7 days default)
- Verify user exists in DynamoDB

#### 5. Bedrock Access Denied
- Verify IAM role has Bedrock permissions
- Check that model ID is correct
- Ensure Bedrock is available in your region

### Debug Commands

```bash
# Check CDK diff
cd infrastructure
npx cdk diff

# View CloudFormation stack
aws cloudformation describe-stacks --stack-name FirstLineStack

# Check DynamoDB table
aws dynamodb describe-table --table-name FirstLineTable

# Test Lambda directly
aws lambda invoke \
  --function-name FirstLineStack-HealthHandler \
  --payload '{}' \
  response.json
```

## Rollback

### Rollback Infrastructure

```bash
cd infrastructure

# Destroy stack
npx cdk destroy

# Or rollback to previous version
aws cloudformation update-stack \
  --stack-name FirstLineStack \
  --use-previous-template
```

### Rollback Application

```bash
# Revert to previous commit
git revert HEAD
git push origin main
```

## Security Checklist

Before production deployment:

- [ ] Change JWT_SECRET to a secure random string
- [ ] Move secrets to AWS Secrets Manager
- [ ] Enable AWS WAF on API Gateway
- [ ] Configure custom domain with SSL
- [ ] Set up CloudWatch alarm notifications (SNS)
- [ ] Enable CloudTrail for audit logging
- [ ] Review IAM permissions (least privilege)
- [ ] Enable MFA for AWS account
- [ ] Set up backup strategy for DynamoDB
- [ ] Configure log retention policies
- [ ] Enable Sentry error tracking
- [ ] Review CORS configuration
- [ ] Test disaster recovery procedures
- [ ] Conduct security penetration testing

## Cost Optimization

### Estimated Monthly Costs (Low Traffic)

- Lambda: $5-20 (1M requests)
- API Gateway: $3.50 (1M requests)
- DynamoDB: $1-5 (on-demand)
- S3: $1-3
- CloudWatch: $5-10
- **Total: ~$15-40/month**

### Cost Optimization Tips

1. Use DynamoDB on-demand pricing for variable traffic
2. Set CloudWatch log retention to 7 days
3. Enable S3 lifecycle policies
4. Use Lambda reserved concurrency for predictable workloads
5. Monitor costs with AWS Cost Explorer

## Scaling

### Horizontal Scaling

Lambda and API Gateway scale automatically. No configuration needed.

### Vertical Scaling

Increase Lambda memory/timeout if needed:
```typescript
// infrastructure/lib/firstline-stack.ts
memorySize: 1024, // Increase from 512
timeout: cdk.Duration.seconds(60), // Increase from 30
```

### Multi-Region Deployment

1. Deploy stack to multiple regions
2. Use Route 53 for DNS failover
3. Configure DynamoDB global tables
4. Set up S3 cross-region replication

## Support

### Documentation
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)

### Getting Help
- Check CloudWatch logs first
- Review security audit: `SECURITY_AUDIT.md`
- Review phase progress: `PHASE2_PROGRESS.md`

---

**Last Updated**: Phase 2 Complete
**Next Review**: After first deployment
