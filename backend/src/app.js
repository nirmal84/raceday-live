import express from 'express'
import cors from 'cors'
import healthRouter from './routes/health.js'
import faultRouter from './routes/fault.js'

const app = express()

const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLOUDFRONT_DOMAIN,
].filter(Boolean)

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}))

app.use(express.json())

app.use('/health', healthRouter)
app.use('/fault', faultRouter)

export default app
