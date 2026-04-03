# RaceDay Live

A full-stack demo platform simulating a live wagering system. Designed to demonstrate a DevOps Agent resolution scenario: an admin injects a fault that visibly breaks frontend features, pushes custom metrics to CloudWatch, and fires a real AWS alarm — which a DevOps Agent then investigates and resolves.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser                                            │
│  React + Vite  ──polls /fault/status every 5s──►   │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS
                ┌────────▼────────┐
                │  API Gateway    │  (HTTP API)
                │  (ap-southeast-2)│
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │  Lambda         │  Node.js 20
                │  Express app    │
                └──┬──────────┬───┘
                   │          │
         ┌─────────▼──┐  ┌────▼──────────┐
         │  SSM        │  │  CloudWatch   │
         │  Parameter  │  │  Metrics      │
         │  Store      │  │  + Alarms     │
         └─────────────┘  └───────────────┘

┌─────────────────────────────────────────────────────┐
│  Frontend static assets                             │
│  S3 Bucket  ──► CloudFront (OAC, HTTPS only)        │
└─────────────────────────────────────────────────────┘
```

**SSM Parameter Store** (`/raceday/fault/state`) is the single source of truth for fault state. The frontend never calls AWS directly — it polls the backend API, which reads/writes SSM.

## Fault Scenarios

| Scenario | Affected Services | Visual Impact |
|---|---|---|
| `memory_leak` | odds-engine 🔴, bet-placement 🟡 | Odds freeze, bet buttons error, OddsEngineGrid goes offline |
| `db_saturation` | user-auth 🔴, bet-placement 🟡 | Auth errors in log stream, bet degradation |
| `payment_timeout` | payment-gateway 🔴 | Payment errors in log stream |
| `full_cascade` | all services 🔴 (staggered 2s) | Everything degrades simultaneously |

When a fault is injected:
- Frontend enters degraded state within 5 seconds (next poll)
- `ServiceErrorRate=100` and `BetPlacementLatencyP99=8500` are pushed to CloudWatch namespace `RaceDayLive/Platform`
- CloudWatch alarm `RaceDayLive-ServiceErrorRate` fires within ~60 seconds
- SNS notification sent (if email configured)

## Repo Structure

```
raceday-live/
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── components/    # All UI components
│   │   ├── hooks/         # useFaultState, useSimulatedData
│   │   ├── App.jsx
│   │   └── config.js      # API base URL from VITE_API_BASE_URL
│   ├── .env.local         # Local dev: VITE_API_BASE_URL=http://localhost:3001
│   └── package.json
├── backend/           # Node.js + Express (runs on Lambda + local)
│   ├── src/
│   │   ├── routes/        # fault.js, health.js
│   │   ├── services/      # ssm.js, cloudwatch.js
│   │   ├── app.js         # Express app (no listen)
│   │   └── server.js      # Local dev entry point
│   ├── lambda.js          # Lambda handler via @codegenie/serverless-express
│   ├── .env.local         # LOCAL_MODE=true (no AWS needed locally)
│   └── package.json
├── infra/             # AWS CDK (TypeScript)
│   ├── bin/raceday.ts
│   ├── lib/
│   │   ├── raceday-stack.ts      # S3, CloudFront, Lambda, API GW, SSM
│   │   ├── monitoring-stack.ts   # SNS, CloudWatch alarms, dashboard
│   │   └── devops-agent-stack.ts # AgentSpace, SourceAws + EventChannel associations
│   └── package.json
└── package.json       # Root: `npm run dev` starts both services
```

## Local Development

No AWS credentials required — backend uses in-memory fault state.

```bash
# Install all dependencies
npm install && npm run install:all

# Start frontend (localhost:5173) + backend (localhost:3001) together
npm run dev
```

The admin panel is accessible via **Ctrl+Shift+D** — it's intentionally not linked from any navigation.

## AWS Deployment

### Prerequisites

- AWS CLI configured (`aws configure`)
- AWS CDK CLI (`npm install -g aws-cdk`)
- Node.js 20+

### 1. Deploy Infrastructure

```bash
cd infra
npm install
cdk bootstrap   # first time only, per account/region
cdk deploy RaceDayStack --outputs-file outputs.json
cdk deploy MonitoringStack -c notifyEmail=you@example.com
cdk deploy DevOpsAgentStack
```

> `notifyEmail` is optional. If provided, you'll receive an email when alarms fire — confirm the SNS subscription from your inbox.

### 2a. Connect DevOps Agent to CloudWatch Alarms (post-deploy)

After `DevOpsAgentStack` deploys, complete the webhook subscription so CloudWatch alarm events flow into the DevOps Agent:

1. Open the [AWS DevOps Agent console](https://console.aws.amazon.com/devops-agent)
2. Navigate to the **RaceDayLive** Agent Space → EventChannel association
3. Copy the **webhook URL**
4. Subscribe it to the `raceday-incidents` SNS topic:

```bash
aws sns subscribe \
  --topic-arn $(cat outputs.json | jq -r '.MonitoringStack.SnsTopicArn') \
  --protocol https \
  --notification-endpoint <webhook-url-from-console>
```

The DevOps Agent will now automatically trigger an investigation when a `RaceDayLive-ServiceErrorRate` or `RaceDayLive-BetPlacementLatencyP99` alarm fires.

### 2. Build & Deploy Frontend

Use the `ApiEndpoint` value from `outputs.json`:

```bash
cd ../frontend
VITE_API_BASE_URL=https://<api-id>.execute-api.ap-southeast-2.amazonaws.com \
  npm run build

aws s3 sync dist/ s3://$(cat ../infra/outputs.json | jq -r '.RaceDayStack.S3BucketName') --delete

aws cloudfront create-invalidation \
  --distribution-id $(cat ../infra/outputs.json | jq -r '.RaceDayStack.CloudFrontDistributionId') \
  --paths "/*"
```

The app will be live at the `CloudFrontDomain` output URL.

### CDK Outputs

| Stack | Output | Description |
|---|---|---|
| `RaceDayStack` | `ApiEndpoint` | API Gateway URL — use as `VITE_API_BASE_URL` |
| `RaceDayStack` | `CloudFrontDomain` | Frontend URL |
| `RaceDayStack` | `S3BucketName` | Sync `frontend/dist/` here |
| `RaceDayStack` | `CloudFrontDistributionId` | Run cache invalidation after frontend deploy |
| `MonitoringStack` | `SnsTopicArn` | SNS topic for incident alerts |
| `DevOpsAgentStack` | `AgentSpaceId` | DevOps Agent Space ID |
| `DevOpsAgentStack` | `AgentSpaceArn` | DevOps Agent Space ARN |
| `DevOpsAgentStack` | `DevOpsAgentRoleArn` | IAM role assumed by the agent during investigations |
| `DevOpsAgentStack` | `EventChannelAssociationId` | EventChannel Association ID |
| `DevOpsAgentStack` | `WebhookSetupInstructions` | Step-by-step SNS webhook subscription command |

## DevOps Agent Resources

Provisioned by `DevOpsAgentStack`:

| Resource | Type | Description |
|---|---|---|
| `RaceDayLive` AgentSpace | `AWS::DevOpsAgent::AgentSpace` | Agent workspace — AWS default KMS key and OperatorApp |
| SourceAws Association | `AWS::DevOpsAgent::Association` | Gives agent read visibility into this account via `RaceDayLive-DevOpsAgentRole` |
| EventChannel Association | `AWS::DevOpsAgent::Association` | Webhook endpoint for receiving CloudWatch alarm events (`EnableWebhookUpdates: true`) |
| `RaceDayLive-DevOpsAgentRole` | `AWS::IAM::Role` | `ReadOnlyAccess` + CloudWatch/Logs read — assumed by `devops-agent.amazonaws.com` |

**Adding capabilities later:** The CDK stack uses `CfnResource` for all DevOps Agent resources. To add capabilities (e.g. Slack, ServiceNow, MCP servers) add new `AWS::DevOpsAgent::Association` resources to `devops-agent-stack.ts`. Services requiring OAuth (Datadog, GitHub, Slack) must be registered interactively via the console first, then referenced by ServiceId in CDK.

## CloudWatch Resources

- **Namespace:** `RaceDayLive/Platform`
- **Metrics:** `ServiceErrorRate` (Percent), `BetPlacementLatencyP99` (Milliseconds)
- **Alarms:**
  - `RaceDayLive-ServiceErrorRate` — fires when ≥ 50% for 1 evaluation period (60s)
  - `RaceDayLive-BetPlacementLatencyP99` — fires when ≥ 3000ms
- **Dashboard:** `RaceDayLive-Operations` in CloudWatch console

## Admin Panel Usage

1. Open the app in a browser
2. Press **Ctrl+Shift+D** to open the fault injection console
3. Select a scenario and confirm — the UI degrades within 5 seconds
4. The panel shows a live elapsed timer and CloudWatch alarm status (PENDING → IN ALARM after 60s)
5. Press **RESOLVE FAULT** to restore healthy state
