#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { CdkAlbEc2Stack } from '../lib/cdk-alb-ec2';

const app = new App();
const env = { region: 'ap-northeast-1' };

new CdkAlbEc2Stack(app, 'stg-stack', {
  env: env,
  envName: 'stg',
  vpcCidr: '10.0.0.0/16',
});

new CdkAlbEc2Stack(app, 'prd-stack', {
  env: env,
  envName: 'prd',
  vpcCidr: '10.1.0.0/16',
});

app.synth();