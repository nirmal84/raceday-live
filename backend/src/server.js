// Local development entry point — not used in Lambda
import app from './app.js'

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  const mode = process.env.LOCAL_MODE === 'true' ? 'LOCAL (in-memory state)' : 'AWS (SSM + CloudWatch)'
  console.log(`RaceDay backend on :${PORT} [${mode}]`)
})
