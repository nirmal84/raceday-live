import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as sns from 'aws-cdk-lib/aws-sns'
import { Construct } from 'constructs'

interface DevOpsAgentStackProps extends cdk.StackProps {
  /**
   * ARN of the raceday-incidents SNS topic from MonitoringStack.
   * The EventChannel webhook will be subscribed to this topic so CloudWatch
   * alarm events are routed to the DevOps Agent for investigation.
   */
  snsTopicArn: string
}

export class DevOpsAgentStack extends cdk.Stack {
  public readonly agentSpaceId!: string

  constructor(scope: Construct, id: string, props: DevOpsAgentStackProps) {
    super(scope, id, props)

    // ── IAM Role — assumed by DevOps Agent to inspect account resources ────────
    // The agent assumes this role to read CloudWatch alarms, metrics, Lambda
    // configs, API Gateway, SSM, etc. when investigating incidents.
    // ReadOnlyAccess is intentionally broad so the agent can crawl topology;
    // narrow this down once you confirm which services the agent needs.
    const assumableRole = new iam.Role(this, 'DevOpsAgentAssumableRole', {
      roleName: 'RaceDayLive-DevOpsAgentRole',
      assumedBy: new iam.ServicePrincipal('devops-agent.amazonaws.com'),
      description: 'Assumed by DevOps Agent to inspect RaceDay Live resources during incident investigation',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
      ],
    })

    // Grant the agent explicit CloudWatch write for creating metric-based insights
    assumableRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:DescribeAlarms',
        'cloudwatch:GetMetricData',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics',
        'logs:FilterLogEvents',
        'logs:GetLogEvents',
        'logs:DescribeLogGroups',
        'logs:DescribeLogStreams',
      ],
      resources: ['*'],
    }))

    // ── AgentSpace ─────────────────────────────────────────────────────────────
    // KmsKeyArn omitted → AWS managed key (default)
    // OperatorApp omitted → AWS default operator app
    const agentSpace = new cdk.CfnResource(this, 'AgentSpace', {
      type: 'AWS::DevOpsAgent::AgentSpace',
      properties: {
        Name: 'RaceDayLive',
        Description: 'DevOps Agent space for RaceDay Live — investigates and resolves CloudWatch alarms triggered by fault injection scenarios',
        // KmsKeyArn: omitted — use AWS default managed key
        // OperatorApp: omitted — use AWS defaults
        Tags: [
          { Key: 'Project', Value: 'RaceDayLive' },
          { Key: 'ManagedBy', Value: 'CDK' },
        ],
      },
    })

    // ── SourceAws Association ─────────────────────────────────────────────────
    // Gives the agent read visibility into this AWS account's resources so it
    // can crawl topology: Lambda, API Gateway, CloudWatch, SSM, etc.
    new cdk.CfnResource(this, 'SourceAwsAssociation', {
      type: 'AWS::DevOpsAgent::Association',
      properties: {
        AgentSpaceId: agentSpace.ref,
        ServiceId: 'aws',
        Configuration: {
          SourceAws: {
            AccountId: this.account,
            AccountType: 'source',
            AssumableRoleArn: assumableRole.roleArn,
            // Resources omitted — agent will discover all resources in account.
            // Add resource filters here to scope to RaceDay Live resources:
            // Resources: [{ ... }]
            Tags: [
              { Key: 'Project', Value: 'RaceDayLive' },
            ],
          },
        },
      },
    })

    // ── EventChannel Association ───────────────────────────────────────────────
    // Creates a webhook endpoint on the AgentSpace. With EnableWebhookUpdates: true,
    // the agent automatically manages the webhook lifecycle.
    // After deploy, retrieve the webhook URL from the DevOps Agent console and
    // subscribe it to the raceday-incidents SNS topic (see outputs below).
    const eventChannelAssociation = new cdk.CfnResource(this, 'EventChannelAssociation', {
      type: 'AWS::DevOpsAgent::Association',
      properties: {
        AgentSpaceId: agentSpace.ref,
        ServiceId: 'aws',
        Configuration: {
          EventChannel: {
            EnableWebhookUpdates: true,
          },
        },
      },
    })

    // Ensure EventChannel is created after SourceAws so the agent space is
    // fully initialised before webhook setup begins.
    eventChannelAssociation.addDependency(
      agentSpace as cdk.CfnResource
    )

    // ── SNS Topic reference (from MonitoringStack) ────────────────────────────
    // Importing the existing topic so we can surface its ARN alongside the
    // webhook instructions in the outputs. The actual webhook subscription
    // must be done manually after retrieving the URL from the console.
    const incidentTopic = sns.Topic.fromTopicArn(this, 'IncidentTopic', props.snsTopicArn)

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AgentSpaceId', {
      value: agentSpace.ref,
      description: 'DevOps Agent Space ID',
    })

    new cdk.CfnOutput(this, 'AgentSpaceArn', {
      value: agentSpace.getAtt('Arn').toString(),
      description: 'DevOps Agent Space ARN',
    })

    new cdk.CfnOutput(this, 'DevOpsAgentRoleArn', {
      value: assumableRole.roleArn,
      description: 'IAM role assumed by DevOps Agent to inspect RaceDay Live resources',
    })

    new cdk.CfnOutput(this, 'EventChannelAssociationId', {
      value: eventChannelAssociation.ref,
      description: 'EventChannel Association ID',
    })

    new cdk.CfnOutput(this, 'WebhookSetupInstructions', {
      value: [
        '1. Open AWS DevOps Agent console',
        `2. Navigate to Agent Space: RaceDayLive (ID from AgentSpaceId output)`,
        '3. Open the EventChannel association and copy the webhook URL',
        `4. Subscribe the webhook URL to SNS topic: ${incidentTopic.topicArn}`,
        '   aws sns subscribe --topic-arn <topic-arn> --protocol https --notification-endpoint <webhook-url>',
      ].join(' | '),
      description: 'Steps to connect CloudWatch alarms → SNS → DevOps Agent webhook',
    })
  }
}
