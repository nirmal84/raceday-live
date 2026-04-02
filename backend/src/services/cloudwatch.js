import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch'

const client = process.env.LOCAL_MODE !== 'true'
  ? new CloudWatchClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
  : null

export async function putMetric(namespace, metricName, value, unit, dimensions = []) {
  if (process.env.LOCAL_MODE === 'true') {
    console.log(`[cloudwatch] LOCAL_MODE — skipping putMetric: ${namespace}/${metricName} = ${value} ${unit}`)
    return
  }

  try {
    await client.send(new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: [{
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Dimensions: dimensions,
        Timestamp: new Date(),
      }],
    }))
  } catch (e) {
    console.error(`[cloudwatch] putMetric failed [${namespace}/${metricName}]:`, e.message)
    // Intentionally swallowed — fault inject/resolve must not fail if CW is unavailable
  }
}
