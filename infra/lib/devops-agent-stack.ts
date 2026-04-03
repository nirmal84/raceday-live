/**
 * DevOpsAgentStack
 *
 * Provisions the AWS DevOps Agent space for RaceDay Live incident investigation.
 *
 * Resources created:
 *  - DevOpsAgentRole-AgentSpace    IAM role assumed by aidevops.amazonaws.com for account monitoring
 *  - DevOpsAgentRole-WebappAdmin   IAM role for the DevOps Agent operator web app
 *  - AgentSpace                    AWS::DevOpsAgent::AgentSpace (default KMS, IAM-backed operator app)
 *  - MonitorAssociation            AWS::DevOpsAgent::Association  Aws/monitor — read this account
 *  - EventChannelAssociation       AWS::DevOpsAgent::Association  EventChannel webhook for CW alarms
 *  - WebhookSetupFn                Lambda custom resource handler
 *  - WebhookSetup                  Custom resource: calls ListWebhooks → subscribes URL to SNS topic
 *
 * Supported regions: us-east-1, us-west-2, ap-southeast-2, ap-northeast-1, eu-central-1, eu-west-1
 */

import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Provider } from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'
import * as path from 'path'

interface DevOpsAgentStackProps extends cdk.StackProps {
  /** ARN of the raceday-incidents SNS topic from MonitoringStack */
  snsTopicArn: string
}

export class DevOpsAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DevOpsAgentStackProps) {
    super(scope, id, props)

    // ── IAM Role: AgentSpace ───────────────────────────────────────────────────
    // Assumed by the DevOps Agent service to monitor this account's resources.
    // Requires AIDevOpsAgentAccessPolicy (managed by AWS) + permission to create
    // the Resource Explorer service-linked role so the agent can index resources.
    const agentSpaceRole = new iam.Role(this, 'AgentSpaceRole', {
      roleName: 'DevOpsAgentRole-AgentSpace',
      description: 'Assumed by aidevops.amazonaws.com to monitor RaceDay Live resources',
      assumedBy: new iam.ServicePrincipal('aidevops.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: { 'aws:SourceArn': `arn:aws:aidevops:${this.region}:${this.account}:agentspace/*` },
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AIDevOpsAgentAccessPolicy'),
      ],
    })

    // Allow the agent to create the Resource Explorer service-linked role
    // (needed for resource topology discovery)
    agentSpaceRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowCreateResourceExplorerSLR',
      effect: iam.Effect.ALLOW,
      actions: ['iam:CreateServiceLinkedRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/aws-service-role/resource-explorer-2.amazonaws.com/AWSServiceRoleForResourceExplorer`,
      ],
    }))

    // ── IAM Role: Operator Web App ─────────────────────────────────────────────
    // Used by the DevOps Agent web console (operator app). Requires both
    // AssumeRole and TagSession actions per the AWS sample template.
    const operatorRole = new iam.Role(this, 'OperatorRole', {
      roleName: 'DevOpsAgentRole-WebappAdmin',
      description: 'Operator app role for the DevOps Agent web console',
      assumedBy: new iam.ServicePrincipal('aidevops.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: { 'aws:SourceArn': `arn:aws:aidevops:${this.region}:${this.account}:agentspace/*` },
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AIDevOpsOperatorAppAccessPolicy'),
      ],
    })
    // TagSession requires an explicit trust policy action — add it inline
    ;(operatorRole.assumeRolePolicy as iam.PolicyDocument).addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('aidevops.amazonaws.com')],
        actions: ['sts:TagSession'],
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: { 'aws:SourceArn': `arn:aws:aidevops:${this.region}:${this.account}:agentspace/*` },
        },
      })
    )

    // ── AgentSpace ─────────────────────────────────────────────────────────────
    // KmsKeyArn omitted → AWS-managed default key.
    // OperatorApp.Iam is required — uses the operator role above.
    const agentSpace = new cdk.CfnResource(this, 'AgentSpace', {
      type: 'AWS::DevOpsAgent::AgentSpace',
      properties: {
        Name: 'RaceDayLive',
        Description: 'DevOps Agent space for RaceDay Live — investigates CloudWatch alarms from fault injection scenarios',
        OperatorApp: {
          Iam: {
            OperatorAppRoleArn: operatorRole.roleArn,
          },
        },
        // KmsKeyArn omitted — AWS default managed key
        Tags: [
          { Key: 'Project', Value: 'RaceDayLive' },
          { Key: 'ManagedBy', Value: 'CDK' },
        ],
      },
    })
    agentSpace.addDependency(agentSpaceRole.node.defaultChild as cdk.CfnResource)
    agentSpace.addDependency(operatorRole.node.defaultChild as cdk.CfnResource)

    // ── Monitor Association (same-account) ─────────────────────────────────────
    // AccountType: monitor — gives the agent monitoring visibility into this
    // account using the agentSpaceRole. This is the primary account association.
    const monitorAssociation = new cdk.CfnResource(this, 'MonitorAssociation', {
      type: 'AWS::DevOpsAgent::Association',
      properties: {
        AgentSpaceId: agentSpace.getAtt('AgentSpaceId'),
        ServiceId: 'aws',
        Configuration: {
          Aws: {
            AssumableRoleArn: agentSpaceRole.roleArn,
            AccountId: this.account,
            AccountType: 'monitor',
          },
        },
      },
    })
    monitorAssociation.addDependency(agentSpace)

    // ── EventChannel Association ───────────────────────────────────────────────
    // Creates a managed webhook endpoint on the AgentSpace. With
    // EnableWebhookUpdates: true the agent owns the webhook lifecycle.
    // The custom resource below retrieves the URL and wires it to SNS.
    const eventChannelAssociation = new cdk.CfnResource(this, 'EventChannelAssociation', {
      type: 'AWS::DevOpsAgent::Association',
      properties: {
        AgentSpaceId: agentSpace.getAtt('AgentSpaceId'),
        ServiceId: 'aws',
        Configuration: {
          EventChannel: {
            EnableWebhookUpdates: true,
          },
        },
      },
    })
    eventChannelAssociation.addDependency(monitorAssociation)

    // ── Webhook Setup: Lambda + Custom Resource ────────────────────────────────
    // After the EventChannel association is created, calls ListWebhooks on the
    // DevOps Agent API to retrieve the webhook URL, then subscribes it to the
    // raceday-incidents SNS topic. Unsubscribes automatically on stack deletion.

    const webhookSetupFn = new NodejsFunction(this, 'WebhookSetupFn', {
      description: 'Custom resource: wires DevOps Agent EventChannel webhook to raceday-incidents SNS topic',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../lambda/webhook-setup.mjs'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),   // retries up to ~2 min for webhook availability
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        format: OutputFormat.ESM,
        externalModules: [],              // bundle all deps including aws-sdk clients
        minify: false,
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    })

    webhookSetupFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        // DevOps Agent: retrieve webhook URL for EventChannel association
        // IAM prefix may appear as devops-agent:* or aidevops:* depending on region.
        // Using wildcard to cover both while the service IAM surface stabilises.
        'devops-agent:ListWebhooks',
        'aidevops:ListWebhooks',
      ],
      resources: ['*'],
    }))

    webhookSetupFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sns:Subscribe', 'sns:Unsubscribe'],
      resources: [props.snsTopicArn],
    }))

    const webhookProvider = new Provider(this, 'WebhookSetupProvider', {
      onEventHandler: webhookSetupFn,
    })

    const webhookSetup = new cdk.CustomResource(this, 'WebhookSetup', {
      serviceToken: webhookProvider.serviceToken,
      properties: {
        AgentSpaceId: agentSpace.getAtt('AgentSpaceId'),
        AssociationId: eventChannelAssociation.ref,
        SnsTopicArn: props.snsTopicArn,
      },
    })
    webhookSetup.node.addDependency(eventChannelAssociation)

    // ── Outputs ────────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AgentSpaceId', {
      value: agentSpace.getAtt('AgentSpaceId').toString(),
      description: 'DevOps Agent Space ID',
    })

    new cdk.CfnOutput(this, 'AgentSpaceArn', {
      value: agentSpace.getAtt('Arn').toString(),
      description: 'DevOps Agent Space ARN',
    })

    new cdk.CfnOutput(this, 'AgentSpaceRoleArn', {
      value: agentSpaceRole.roleArn,
      description: 'IAM role assumed by the DevOps Agent to monitor this account',
    })

    new cdk.CfnOutput(this, 'OperatorRoleArn', {
      value: operatorRole.roleArn,
      description: 'IAM role for the DevOps Agent operator web app',
    })

    new cdk.CfnOutput(this, 'WebhookUrl', {
      value: webhookSetup.getAttString('WebhookUrl'),
      description: 'EventChannel webhook URL — already subscribed to raceday-incidents SNS topic',
    })

    new cdk.CfnOutput(this, 'SnsSubscriptionArn', {
      value: webhookSetup.getAttString('SubscriptionArn'),
      description: 'SNS subscription ARN for the DevOps Agent webhook',
    })
  }
}
