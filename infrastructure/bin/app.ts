#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SafeartStack } from '../lib/stack';

const app = new cdk.App();

const env = app.node.tryGetContext('env') || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

new SafeartStack(app, `SafeartStack-${env}`, {
  env: {
    account,
    region,
  },
  description: `Safeart infrastructure stack (${env})`,
  tags: {
    Environment: env,
    Project: 'Safeart',
  },
});

