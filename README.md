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
│   │   ├── raceday-stack.ts        # S3, CloudFront, Lambda, API GW, SSM
│   │   ├── frontend-deploy-stack.ts# npm build + S3 upload + CF invalidation
│   │   ├── monitoring-stack.ts     # SNS, CloudWatch alarms, dashboard
│   │   └── devops-agent-stack.ts   # AgentSpace, associations, webhook automation
│   ├── lambda/
│   │   └── webhook-setup.mjs       # Custom resource: ListWebhooks → SNS Subscribe
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

### One-command deploy

```bash
# From repo root — deploys everything including frontend build
npm run deploy

# With SNS email alerts
NOTIFY_EMAIL=you@example.com npm run deploy
```

`scripts/deploy.sh` does this automatically:
1. `cdk deploy RaceDayStack` — Lambda, API GW, S3, CloudFront, SSM
2. `cdk deploy FrontendDeployStack -c apiUrl=<url>` — builds React with `VITE_API_BASE_URL` baked in, uploads to S3, invalidates CloudFront cache
3. `cdk deploy MonitoringStack` — SNS, CloudWatch alarms, dashboard
4. `cdk deploy DevOpsAgentStack` — AgentSpace, associations, SNS webhook auto-wired

The CloudWatch → SNS → DevOps Agent webhook subscription is **fully automated** — a CDK custom resource Lambda calls `ListWebhooks` then subscribes to SNS. No manual steps.

### Manual step-by-step (if preferred)

```bash
cd infra
npm install
cdk bootstrap   # first time only, per account/region

cdk deploy RaceDayStack --outputs-file outputs.json
API_URL=$(jq -r '.RaceDayStack.ApiEndpoint' outputs.json)
cdk deploy FrontendDeployStack -c apiUrl="$API_URL"
cdk deploy MonitoringStack -c notifyEmail=you@example.com
cdk deploy DevOpsAgentStack
```

### CDK Outputs

| Stack | Output | Description |
|---|---|---|
| `RaceDayStack` | `ApiEndpoint` | API Gateway URL — use as `VITE_API_BASE_URL` |
| `RaceDayStack` | `CloudFrontDomain` | Frontend URL |
| `RaceDayStack` | `S3BucketName` | Frontend bucket (managed by FrontendDeployStack) |
| `RaceDayStack` | `CloudFrontDistributionId` | CF distribution (invalidated by FrontendDeployStack) |
| `FrontendDeployStack` | `DeployedTo` | S3 bucket URL of the deployed build |
| `FrontendDeployStack` | `ApiUrlUsed` | `VITE_API_BASE_URL` baked into this build |
| `MonitoringStack` | `SnsTopicArn` | SNS topic for incident alerts |
| `DevOpsAgentStack` | `AgentSpaceId` | DevOps Agent Space ID |
| `DevOpsAgentStack` | `AgentSpaceArn` | DevOps Agent Space ARN |
| `DevOpsAgentStack` | `AgentSpaceRoleArn` | IAM role (`AIDevOpsAgentAccessPolicy`) assumed by the agent |
| `DevOpsAgentStack` | `OperatorRoleArn` | IAM role for the DevOps Agent web console |
| `DevOpsAgentStack` | `WebhookUrl` | EventChannel webhook URL (already subscribed to SNS) |
| `DevOpsAgentStack` | `SnsSubscriptionArn` | SNS subscription ARN for the webhook |

## DevOps Agent Resources

Provisioned by `DevOpsAgentStack`:

| Resource | Type | Description |
|---|---|---|
| `RaceDayLive` AgentSpace | `AWS::DevOpsAgent::AgentSpace` | Agent workspace — AWS default KMS key, IAM-backed operator app |
| `DevOpsAgentRole-AgentSpace` | `AWS::IAM::Role` | `AIDevOpsAgentAccessPolicy` — assumed by `aidevops.amazonaws.com` to monitor this account |
| `DevOpsAgentRole-WebappAdmin` | `AWS::IAM::Role` | `AIDevOpsOperatorAppAccessPolicy` — used by the DevOps Agent web console |
| Monitor Association | `AWS::DevOpsAgent::Association` | `Aws/monitor` — gives agent full monitoring visibility into this account |
| EventChannel Association | `AWS::DevOpsAgent::Association` | Webhook endpoint for CloudWatch alarm events (`EnableWebhookUpdates: true`) |
| `WebhookSetupFn` | Lambda | Custom resource: calls `ListWebhooks`, subscribes webhook URL to `raceday-incidents` SNS |

**Alarm → Agent flow (fully automated after deploy):**
```
CloudWatch Alarm fires → SNS raceday-incidents → DevOps Agent EventChannel webhook → Agent investigates
```

**Adding capabilities later:** Add new `AWS::DevOpsAgent::Association` `CfnResource` blocks to `devops-agent-stack.ts`. Services requiring OAuth (GitHub, Slack, Datadog) must be registered interactively in the console first, then referenced by `ServiceId` in CDK.

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
