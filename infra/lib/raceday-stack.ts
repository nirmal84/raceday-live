import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import * as path from 'path'

const FAULT_STATE_PARAM = '/raceday/fault/state'

export class RaceDayStack extends cdk.Stack {
  public readonly serviceErrorRateAlarmName: string

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // ── SSM Parameter (initial fault state) ──────────────────────────────────
    const faultParam = new ssm.StringParameter(this, 'FaultStateParam', {
      parameterName: FAULT_STATE_PARAM,
      stringValue: JSON.stringify({ active: false, scenario: null, injectedAt: null }),
      description: 'RaceDay Live fault state',
    })

    // ── S3 Bucket (frontend) ──────────────────────────────────────────────────
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // ── CloudFront ────────────────────────────────────────────────────────────
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    })

    const cloudfrontDomain = `https://${distribution.distributionDomainName}`

    // ── Lambda (bundled via esbuild) ──────────────────────────────────────────
    const backendFn = new NodejsFunction(this, 'BackendFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/lambda.js'),
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        format: OutputFormat.ESM,
        // Bundle all deps — no need for a layer
        nodeModules: [],
        externalModules: [],
        minify: false,
        sourceMap: true,
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        FAULT_STATE_PARAM,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        NODE_OPTIONS: '--enable-source-maps',
      },
    })

    backendFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }))

    backendFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:PutParameter'],
      resources: [faultParam.parameterArn],
    }))

    // ── API Gateway (HTTP API) ────────────────────────────────────────────────
    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['http://localhost:5173', cloudfrontDomain],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST],
        allowHeaders: ['Content-Type'],
      },
    })

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration('BackendIntegration', backendFn),
    })

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.apiEndpoint,
      description: 'Set as VITE_API_BASE_URL when building the frontend',
    })

    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: cloudfrontDomain,
    })

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: siteBucket.bucketName,
      description: 'Run: aws s3 sync frontend/dist/ s3://<bucket> --delete',
    })

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'Run: aws cloudfront create-invalidation --distribution-id <id> --paths "/*"',
    })

    this.serviceErrorRateAlarmName = 'RaceDayLive-ServiceErrorRate'
  }
}
