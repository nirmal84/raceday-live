import * as cdk from 'aws-cdk-lib'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import { Construct } from 'constructs'

interface MonitoringStackProps extends cdk.StackProps {
  notifyEmail?: string
}

const NAMESPACE = 'RaceDayLive/Platform'

export class MonitoringStack extends cdk.Stack {
  /** ARN of the raceday-incidents SNS topic — consumed by DevOpsAgentStack */
  public readonly snsTopicArn: string

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props)

    // ── SNS Topic ─────────────────────────────────────────────────────────────
    const topic = new sns.Topic(this, 'IncidentTopic', {
      topicName: 'raceday-incidents',
      displayName: 'RaceDay Live Incidents',
    })

    this.snsTopicArn = topic.topicArn

    if (props.notifyEmail) {
      topic.addSubscription(new snsSubscriptions.EmailSubscription(props.notifyEmail))
    }

    const snsAction = new actions.SnsAction(topic)

    // ── ServiceErrorRate Alarm ────────────────────────────────────────────────
    const errorRateMetric = new cloudwatch.Metric({
      namespace: NAMESPACE,
      metricName: 'ServiceErrorRate',
      statistic: 'Maximum',
      period: cdk.Duration.seconds(60),
    })

    const errorRateAlarm = new cloudwatch.Alarm(this, 'ServiceErrorRateAlarm', {
      alarmName: 'RaceDayLive-ServiceErrorRate',
      alarmDescription: 'RaceDay Live — Service error rate exceeds 50%. DevOps Agent investigation required.',
      metric: errorRateMetric,
      threshold: 50,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })

    errorRateAlarm.addAlarmAction(snsAction)

    // ── BetPlacementLatencyP99 Alarm ──────────────────────────────────────────
    const latencyMetric = new cloudwatch.Metric({
      namespace: NAMESPACE,
      metricName: 'BetPlacementLatencyP99',
      statistic: 'Maximum',
      period: cdk.Duration.seconds(60),
    })

    const latencyAlarm = new cloudwatch.Alarm(this, 'BetPlacementLatencyAlarm', {
      alarmName: 'RaceDayLive-BetPlacementLatencyP99',
      alarmDescription: 'RaceDay Live — p99 bet placement latency exceeds 3s SLO.',
      metric: latencyMetric,
      threshold: 3000,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })

    latencyAlarm.addAlarmAction(snsAction)

    // ── CloudWatch Dashboard ──────────────────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: 'RaceDayLive-Operations',
    })

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Service Error Rate (%)',
        left: [errorRateMetric],
        width: 12,
        period: cdk.Duration.hours(1),
      }),
      new cloudwatch.GraphWidget({
        title: 'Bet Placement Latency P99 (ms)',
        left: [latencyMetric],
        width: 12,
        period: cdk.Duration.hours(1),
      }),
      new cloudwatch.AlarmStatusWidget({
        title: 'Alarm Status',
        alarms: [errorRateAlarm, latencyAlarm],
        width: 24,
      }),
    )

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: topic.topicArn,
      description: 'SNS topic for incident notifications',
    })
  }
}
