import { Router } from 'express'
import { getFaultState, setFaultState } from '../services/ssm.js'
import { putMetric } from '../services/cloudwatch.js'

const router = Router()
const NAMESPACE = 'RaceDayLive/Platform'

router.get('/status', async (req, res) => {
  try {
    const state = await getFaultState()
    res.json(state)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/inject', async (req, res) => {
  const { scenario } = req.body
  const valid = ['memory_leak', 'db_saturation', 'payment_timeout', 'full_cascade']
  if (!valid.includes(scenario)) {
    return res.status(400).json({ error: 'Invalid scenario' })
  }

  const injectedAt = new Date().toISOString()

  try {
    await setFaultState({ active: true, scenario, injectedAt })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  // Push metrics — errors swallowed inside putMetric
  await putMetric(NAMESPACE, 'ServiceErrorRate', 100, 'Percent', [
    { Name: 'Scenario', Value: scenario },
  ])
  await putMetric(NAMESPACE, 'BetPlacementLatencyP99', 8500, 'Milliseconds')

  res.json({ success: true, injectedAt })
})

router.post('/resolve', async (req, res) => {
  try {
    await setFaultState({ active: false, scenario: null, injectedAt: null })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  await putMetric(NAMESPACE, 'ServiceErrorRate', 0, 'Percent')
  await putMetric(NAMESPACE, 'BetPlacementLatencyP99', 145, 'Milliseconds')

  res.json({ success: true, resolvedAt: new Date().toISOString() })
})

export default router
