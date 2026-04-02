import * as cdk from 'aws-cdk-lib'
import { RaceDayStack } from '../lib/raceday-stack'
import { MonitoringStack } from '../lib/monitoring-stack'

const app = new cdk.App()

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
}

const raceDayStack = new RaceDayStack(app, 'RaceDayStack', { env })

new MonitoringStack(app, 'MonitoringStack', {
  env,
  notifyEmail: app.node.tryGetContext('notifyEmail'),
})
