#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FirstLineStack } from '../lib/firstline-stack';

const app = new cdk.App();

// Get environment from context or default to 'dev'
const env = app.node.tryGetContext('env') || 'dev';

new FirstLineStack(app, `FirstLineStack-${env}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'FirstLine Healthcare Triage Platform - Multi-channel AI-powered clinical decision support',
  tags: {
    Environment: env,
    Project: 'FirstLine',
    ManagedBy: 'CDK',
  },
});
