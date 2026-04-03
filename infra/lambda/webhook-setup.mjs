/**
 * CDK Custom Resource handler — DevOps Agent EventChannel webhook → SNS subscription
 *
 * Lifecycle:
 *   Create/Update: calls ListWebhooks to retrieve the EventChannel webhook URL,
 *                  then subscribes it to the raceday-incidents SNS topic.
 *   Delete:        unsubscribes the SNS subscription (best-effort).
 *
 * The PhysicalResourceId is set to the SNS SubscriptionArn so CDK/CloudFormation
 * can track and clean it up on stack deletion.
 */

import { DevOpsAgentClient, ListWebhooksCommand } from '@aws-sdk/client-devops-agent'
import { SNSClient, SubscribeCommand, UnsubscribeCommand } from '@aws-sdk/client-sns'

const devops = new DevOpsAgentClient({})
const sns = new SNSClient({})

/** Poll ListWebhooks until the URL appears (association may take a few seconds to register). */
async function getWebhookUrl(agentSpaceId, associationId, maxAttempts = 12) {
  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`[webhook-setup] ListWebhooks attempt ${i}/${maxAttempts}`)
    try {
      const res = await devops.send(new ListWebhooksCommand({ agentSpaceId, associationId }))
      const url = res.webhooks?.[0]?.webhookUrl
      if (url) {
        console.log(`[webhook-setup] webhook URL found: ${url}`)
        return url
      }
    } catch (e) {
      console.warn(`[webhook-setup] ListWebhooks error (attempt ${i}):`, e.message)
    }
    if (i < maxAttempts) await sleep(10_000)  // 10s between attempts, max ~2 min total
  }
  throw new Error('EventChannel webhook URL not available after maximum retries')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const handler = async (event) => {
  console.log('[webhook-setup] Event:', JSON.stringify(event, null, 2))

  const { AgentSpaceId, AssociationId, SnsTopicArn } = event.ResourceProperties

  // ── CREATE / UPDATE ────────────────────────────────────────────────────────
  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    // If updating, unsubscribe the previous subscription first
    if (event.RequestType === 'Update') {
      const prev = event.OldResourceProperties
      if (event.PhysicalResourceId?.startsWith('arn:aws:sns:')) {
        try {
          await sns.send(new UnsubscribeCommand({ SubscriptionArn: event.PhysicalResourceId }))
          console.log('[webhook-setup] Unsubscribed old subscription:', event.PhysicalResourceId)
        } catch (e) {
          console.warn('[webhook-setup] Old unsubscribe failed (non-fatal):', e.message)
        }
      }
    }

    const webhookUrl = await getWebhookUrl(AgentSpaceId, AssociationId)

    const subRes = await sns.send(new SubscribeCommand({
      TopicArn: SnsTopicArn,
      Protocol: 'https',
      Endpoint: webhookUrl,
    }))

    console.log('[webhook-setup] SNS subscription ARN:', subRes.SubscriptionArn)

    return {
      PhysicalResourceId: subRes.SubscriptionArn,
      Data: {
        WebhookUrl: webhookUrl,
        SubscriptionArn: subRes.SubscriptionArn,
      },
    }
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (event.RequestType === 'Delete') {
    const subscriptionArn = event.PhysicalResourceId
    if (subscriptionArn?.startsWith('arn:aws:sns:')) {
      try {
        await sns.send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }))
        console.log('[webhook-setup] Unsubscribed:', subscriptionArn)
      } catch (e) {
        // Subscription may already be gone — safe to ignore on stack tear-down
        console.warn('[webhook-setup] Unsubscribe failed (non-fatal on delete):', e.message)
      }
    }
    return { PhysicalResourceId: subscriptionArn }
  }
}
