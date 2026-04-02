# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RaceDay Live is a full-stack demo web application simulating a live wagering platform. Its primary purpose is to demonstrate a DevOps Agent resolution scenario: an admin injects a fault that breaks frontend features, pushes metrics to CloudWatch, and fires an AWS alarm — then a DevOps Agent resolves it.

## Repo Structure

```
raceday-live/
├── frontend/       # React + Vite SPA, hosted on S3 + CloudFront
├── backend/        # Node.js + Express, runs on Lambda via API Gateway
└── infra/          # AWS CDK (TypeScript) — all AWS resources
```

## Development Commands

### Frontend
```bash
cd frontend
npm install
npm run dev          # localhost:5173
npm run build        # outputs to dist/
```

### Backend
```bash
cd backend
npm install
npm run start        # local Express server (not Lambda)
```

### Infrastructure
```bash
cd infra
npm install
cdk bootstrap
cdk deploy RaceDayStack --outputs-file outputs.json
cdk deploy MonitoringStack -c notifyEmail=your@email.com
```

### Deploy frontend after CDK
```bash
# From frontend/
VITE_API_BASE_URL=<api-gateway-url-from-outputs.json> npm run build
aws s3 sync dist/ s3://<bucket-name> --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

## Architecture

### Fault State Flow
SSM Parameter Store (`/raceday/fault/state`) is the single source of truth for fault state. The frontend never calls AWS directly — it polls `GET /fault/status` every 5 seconds, which reads from SSM. On inject/resolve, the backend writes to SSM and pushes custom CloudWatch metrics.

### Frontend Data Model
`faultState` shape passed as props throughout the component tree:
```js
{ active: boolean, scenario: string|null, injectedAt: ISO string|null, elapsedSeconds: number }
```
`elapsedSeconds` is computed entirely client-side from `injectedAt` — no extra API calls.

### Fault Scenarios
| Scenario | Affected Services |
|---|---|
| `memory_leak` | odds-engine (RED), bet-placement (YELLOW) |
| `db_saturation` | user-auth (RED), bet-placement (YELLOW) |
| `payment_timeout` | payment-gateway (RED) |
| `full_cascade` | all services RED (staggered 2s apart) |

### Key Frontend Hooks
- **`useFaultState`** — polls `/fault/status` every 5s, runs a 1s interval to increment `elapsedSeconds` when fault is active
- **`useSimulatedData`** — drives all fake-live data (odds, counters, throughput); accepts `faultActive` boolean to switch data generation modes; uses `useRef` for interval management

### Backend Routes
- `GET /health` — liveness check
- `GET /fault/status` — reads SSM, returns parsed fault state
- `POST /fault/inject` — writes SSM, pushes `ServiceErrorRate=100` and `BetPlacementLatencyP99=8500` to CloudWatch namespace `RaceDayLive/Platform`
- `POST /fault/resolve` — writes SSM, pushes `ServiceErrorRate=0` and `BetPlacementLatencyP99=145`

CloudWatch errors are swallowed (logged to console) — fault inject/resolve must not fail if CloudWatch is unavailable.

### Infrastructure (CDK)
Two stacks:
- **`RaceDayStack`** — S3 bucket + CloudFront (OAC), Lambda (Node 20, 256MB, 30s timeout), HTTP API Gateway (ANY `/{proxy+}`), SSM parameter (initial state)
- **`MonitoringStack`** — SNS topic, two CloudWatch alarms (`ServiceErrorRate >= 50%`, `BetPlacementLatencyP99 >= 3000ms`), CloudWatch dashboard

Lambda IAM: `cloudwatch:PutMetricData` (*), `ssm:GetParameter` + `ssm:PutParameter` (scoped to `/raceday/fault/state` ARN).

### Admin Panel
Accessible only via `Ctrl+Shift+D` — slide-in drawer from the right. Not linked from navigation. When a fault is active, shows a live elapsed timer (client-computed from `injectedAt`) that goes yellow → orange → red at 2m/5m marks. Shows "CloudWatch Alarm: PENDING 🟡" for 60s after inject, then "IN ALARM 🔴" — cosmetic only, not polling actual alarm state.

### Frontend Environment
`VITE_API_BASE_URL` must be set at build time (not runtime). Defined in `frontend/src/config.js` via `import.meta.env.VITE_API_BASE_URL`. During local development (Phase 1), `useFaultState` uses a mock returning `{ active: false }`.

### CORS
Backend allows CloudFront domain + `localhost:5173`. Configured both in Express and API Gateway.
