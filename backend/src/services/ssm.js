import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm'

const PARAM_NAME = process.env.FAULT_STATE_PARAM || '/raceday/fault/state'
const DEFAULT_STATE = { active: false, scenario: null, injectedAt: null }

// Local in-memory store — used when LOCAL_MODE=true (no AWS credentials needed)
let localState = { ...DEFAULT_STATE }

if (process.env.LOCAL_MODE === 'true') {
  console.log('[ssm] LOCAL_MODE enabled — using in-memory fault state')
}

const client = process.env.LOCAL_MODE !== 'true'
  ? new SSMClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
  : null

export async function getFaultState() {
  if (process.env.LOCAL_MODE === 'true') return { ...localState }

  try {
    const res = await client.send(new GetParameterCommand({ Name: PARAM_NAME }))
    return JSON.parse(res.Parameter.Value)
  } catch (e) {
    if (e.name === 'ParameterNotFound') return { ...DEFAULT_STATE }
    throw e
  }
}

export async function setFaultState(state) {
  if (process.env.LOCAL_MODE === 'true') {
    localState = { ...state }
    return
  }

  await client.send(new PutParameterCommand({
    Name: PARAM_NAME,
    Value: JSON.stringify(state),
    Type: 'String',
    Overwrite: true,
  }))
}
