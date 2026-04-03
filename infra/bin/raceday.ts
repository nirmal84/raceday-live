import * as cdk from 'aws-cdk-lib'
import { RaceDayStack } from '../lib/raceday-stack'
import { MonitoringStack } from '../lib/monitoring-stack'
import { DevOpsAgentStack } from '../lib/devops-agent-stack'

const app = new cdk.App()

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
}

// ── Application stack ──────────────────────────────────────────────────────
new RaceDayStack(app, 'RaceDayStack', { env })

// ── Monitoring stack ───────────────────────────────────────────────────────
// Deploy with: cdk deploy MonitoringStack -c notifyEmail=you@example.com
const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  env,
  notifyEmail: app.node.tryGetContext('notifyEmail'),
})

// ── DevOps Agent stack ─────────────────────────────────────────────────────
// Deploy after MonitoringStack. After deploy, follow WebhookSetupInstructions
// output to subscribe the EventChannel webhook to the raceday-incidents SNS topic.
// Deploy with: cdk deploy DevOpsAgentStack
new DevOpsAgentStack(app, 'DevOpsAgentStack', {
  env,
  snsTopicArn: monitoringStack.snsTopicArn,
})
