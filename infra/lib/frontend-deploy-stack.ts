/**
 * FrontendDeployStack
 *
 * Builds the React frontend and deploys it to S3, then invalidates CloudFront.
 * Runs automatically as part of `scripts/deploy.sh` — no manual aws s3 sync needed.
 *
 * How it works:
 *  1. CDK BucketDeployment with Source.asset() triggers a local bundler at synth time.
 *  2. Local bundler: runs `npm ci && npm run build` in frontend/ with VITE_API_BASE_URL set.
 *  3. The built dist/ is zipped and uploaded to S3 via a Lambda-backed custom resource.
 *  4. BucketDeployment automatically creates a CloudFront invalidation for `/*`.
 *
 * Docker fallback: if Node.js/npm is not available locally (e.g. in CI without Node),
 * CDK falls back to a node:20-alpine Docker image to run the build.
 *
 * Deploy: cdk deploy FrontendDeployStack -c apiUrl=https://xxx.execute-api.ap-southeast-2.amazonaws.com
 * (deploy.sh handles this automatically)
 */

import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'
import * as path from 'path'
import { execSync } from 'child_process'
import { cpSync } from 'fs'

export interface FrontendDeployStackProps extends cdk.StackProps {
  /** S3 bucket to deploy to — from RaceDayStack.siteBucket */
  siteBucket: s3.IBucket
  /** CloudFront distribution to invalidate after deploy — from RaceDayStack.distribution */
  distribution: cloudfront.IDistribution
  /** API Gateway endpoint URL (VITE_API_BASE_URL) — from RaceDayStack outputs */
  apiUrl: string
}

export class FrontendDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendDeployStackProps) {
    super(scope, id, props)

    const frontendDir = path.resolve(__dirname, '../../frontend')
    const { apiUrl, siteBucket, distribution } = props

    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [
        s3deploy.Source.asset(frontendDir, {
          bundling: {
            // ── Local bundler (no Docker required) ──────────────────────────
            // Runs on the developer's machine or CI agent that has Node ≥ 18.
            local: {
              tryBundle(outputDir: string): boolean {
                try {
                  const env = { ...process.env, VITE_API_BASE_URL: apiUrl }
                  const opts = { cwd: frontendDir, stdio: 'inherit' as const, env }

                  console.log(`\n[frontend-deploy] npm ci...`)
                  execSync('npm ci --prefer-offline', opts)

                  console.log(`[frontend-deploy] npm run build  (VITE_API_BASE_URL=${apiUrl})`)
                  execSync('npm run build', opts)

                  console.log(`[frontend-deploy] Copying dist/ → ${outputDir}`)
                  cpSync(path.join(frontendDir, 'dist'), outputDir, { recursive: true })
                  return true
                } catch (e) {
                  console.error('[frontend-deploy] Local bundling failed, trying Docker fallback:', e)
                  return false
                }
              },
            },
            // ── Docker fallback (CI environments without Node.js) ────────────
            image: cdk.DockerImage.fromRegistry('node:20-alpine'),
            environment: { VITE_API_BASE_URL: apiUrl },
            command: [
              'sh', '-c',
              [
                'npm ci --prefer-offline',
                'npm run build',
                'cp -r dist/. /asset-output/',
              ].join(' && '),
            ],
          },
        }),
      ],
      destinationBucket: siteBucket,
      // Trigger a CloudFront invalidation for /* after every deploy
      distribution,
      distributionPaths: ['/*'],
      // Remove files from S3 that are no longer in dist/
      prune: true,
      retainOnDelete: false,
      // Increase memory for the deploy Lambda (large bundles)
      memoryLimit: 512,
    })

    new cdk.CfnOutput(this, 'DeployedTo', {
      value: `s3://${siteBucket.bucketName}`,
    })

    new cdk.CfnOutput(this, 'ApiUrlUsed', {
      value: apiUrl,
      description: 'VITE_API_BASE_URL baked into this frontend build',
    })
  }
}
