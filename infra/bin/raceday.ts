import * as cdk from 'aws-cdk-lib'
import { RaceDayStack } from '../lib/raceday-stack'
import { FrontendDeployStack } from '../lib/frontend-deploy-stack'
import { MonitoringStack } from '../lib/monitoring-stack'
import { DevOpsAgentStack } from '../lib/devops-agent-stack'

const app = new cdk.App()

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
}

// ── Application stack (API, Lambda, S3, CloudFront, SSM) ──────────────────
const raceDayStack = new RaceDayStack(app, 'RaceDayStack', { env })

// ── Frontend deployment ────────────────────────────────────────────────────
// Requires the API URL from RaceDayStack to be passed as context:
//   cdk deploy FrontendDeployStack -c apiUrl=https://xxx.execute-api.region.amazonaws.com
// deploy.sh does this automatically after deploying RaceDayStack.
const apiUrl = app.node.tryGetContext('apiUrl') as string | undefined
if (apiUrl) {
  new FrontendDeployStack(app, 'FrontendDeployStack', {
    env,
    siteBucket: raceDayStack.siteBucket,
    distribution: raceDayStack.distribution,
    apiUrl,
  })
}

// ── Monitoring (SNS, CloudWatch alarms, dashboard) ─────────────────────────
// Optional email alert: cdk deploy MonitoringStack -c notifyEmail=you@example.com
const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  env,
  notifyEmail: app.node.tryGetContext('notifyEmail'),
})

// ── DevOps Agent (AgentSpace, associations, webhook → SNS auto-wired) ─────
new DevOpsAgentStack(app, 'DevOpsAgentStack', {
  env,
  snsTopicArn: monitoringStack.snsTopicArn,
})
