import React from 'react'

const SCENARIO_NAMES = {
  memory_leak: 'Memory Leak — Odds Engine',
  db_saturation: 'DB Saturation — User Auth',
  payment_timeout: 'Payment Timeout — ANZ Gateway',
  full_cascade: 'Full Cascade Failure',
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const styles = {
  banner: {
    background: '#7f1d1d',
    borderBottom: '2px solid #ef4444',
    padding: '10px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fca5a5',
    position: 'sticky',
    top: 0,
    zIndex: 50,
    letterSpacing: '0.02em',
  },
  incRef: {
    marginLeft: 'auto',
    fontSize: '11px',
    color: '#f87171',
    fontFamily: 'monospace',
  },
}

export default function ErrorBanner({ faultState }) {
  if (!faultState.active) return null

  const scenarioName = SCENARIO_NAMES[faultState.scenario] || faultState.scenario
  const elapsed = formatElapsed(faultState.elapsedSeconds || 0)

  return (
    <div style={styles.banner}>
      <span>⚠</span>
      <span>SERVICE DEGRADED — {scenarioName} — {elapsed}</span>
      <span style={styles.incRef}>INC auto-filed: INC0043821</span>
    </div>
  )
}
