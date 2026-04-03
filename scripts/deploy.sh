#!/usr/bin/env bash
# =============================================================================
# RaceDay Live — full deployment script
#
# Deploys all four CDK stacks in the correct order and builds + uploads the
# frontend automatically. No manual aws s3 sync or CloudFront invalidation
# commands needed.
#
# Usage:
#   bash scripts/deploy.sh
#   NOTIFY_EMAIL=you@example.com bash scripts/deploy.sh
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - AWS CDK CLI installed (npm install -g aws-cdk)
#   - Node.js 20+ and npm
#   - jq  (brew install jq  /  apt install jq)
#
# Stacks deployed (in order):
#   1. RaceDayStack        — Lambda, API GW, S3, CloudFront, SSM
#   2. FrontendDeployStack — builds React app, uploads to S3, invalidates CF
#   3. MonitoringStack     — SNS topic, CloudWatch alarms, dashboard
#   4. DevOpsAgentStack    — AgentSpace, associations, SNS webhook (auto-wired)
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"
OUTPUTS_FILE="$INFRA_DIR/outputs.json"
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
step() { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }

# ── Preflight ─────────────────────────────────────────────────────────────────
for cmd in aws cdk jq node npm; do
  command -v "$cmd" &>/dev/null || { echo "❌ '$cmd' not found — install it first."; exit 1; }
done

step "Installing infra dependencies"
cd "$INFRA_DIR"
npm ci --prefer-offline --quiet

# ── Step 1: Infrastructure ────────────────────────────────────────────────────
step "Deploying RaceDayStack (API Gateway, Lambda, S3, CloudFront, SSM)"
cdk deploy RaceDayStack \
  --outputs-file "$OUTPUTS_FILE" \
  --require-approval never

API_URL=$(jq -r '.RaceDayStack.ApiEndpoint' "$OUTPUTS_FILE")
CF_DOMAIN=$(jq -r '.RaceDayStack.CloudFrontDomain' "$OUTPUTS_FILE")
ok "API endpoint: $API_URL"
ok "CloudFront:   $CF_DOMAIN"

# ── Step 2: Frontend build + deploy ──────────────────────────────────────────
step "Building and deploying frontend (VITE_API_BASE_URL=$API_URL)"
cdk deploy FrontendDeployStack \
  -c apiUrl="$API_URL" \
  --outputs-file "$OUTPUTS_FILE" \
  --require-approval never

ok "Frontend live at $CF_DOMAIN"

# ── Step 3: Monitoring ────────────────────────────────────────────────────────
step "Deploying MonitoringStack (SNS, CloudWatch alarms, dashboard)"
NOTIFY_ARG=""
if [ -n "$NOTIFY_EMAIL" ]; then
  NOTIFY_ARG="-c notifyEmail=$NOTIFY_EMAIL"
  echo "   Alarm notifications → $NOTIFY_EMAIL (confirm SNS email after deploy)"
fi
# shellcheck disable=SC2086
cdk deploy MonitoringStack \
  $NOTIFY_ARG \
  --outputs-file "$OUTPUTS_FILE" \
  --require-approval never

ok "CloudWatch alarms active"

# ── Step 4: DevOps Agent ──────────────────────────────────────────────────────
step "Deploying DevOpsAgentStack (AgentSpace + EventChannel → SNS webhook)"
cdk deploy DevOpsAgentStack \
  --outputs-file "$OUTPUTS_FILE" \
  --require-approval never

WEBHOOK_URL=$(jq -r '.DevOpsAgentStack.WebhookUrl // "pending"' "$OUTPUTS_FILE")
ok "DevOps Agent webhook: $WEBHOOK_URL"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  ✅  RaceDay Live deployment complete!${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
echo ""
echo "  🌐  App:     $CF_DOMAIN"
echo "  🔌  API:     $API_URL"
echo "  📊  Dashboard: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=RaceDayLive-Operations"
echo "  🤖  DevOps Agent: https://console.aws.amazon.com/devops-agent"
echo ""
echo "  Press Ctrl+Shift+D in the app to open the fault injection console."
echo ""
