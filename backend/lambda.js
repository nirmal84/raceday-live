import serverlessExpress from '@codegenie/serverless-express'
import app from './src/app.js'

export const handler = serverlessExpress({ app })
