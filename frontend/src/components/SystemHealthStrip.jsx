import React, { useState, useEffect } from 'react'

const SERVICES = ['bet-placement', 'odds-engine', 'payment-gateway', 'user-auth']

const FAULT_MAP = {
  memory_leak: { 'odds-engine': 'red', 'bet-placement': 'yellow' },
  db_saturation: { 'user-auth': 'red', 'bet-placement': 'yellow' },
  payment_timeout: { 'payment-gateway': 'red' },
  full_cascade: { 'bet-placement': 'red', 'odds-engine': 'red', 'payment-gateway': 'red', 'user-auth': 'red' },
}

const CASCADE_ORDER = ['bet-placement', 'odds-engine', 'payment-gateway', 'user-auth']

function getColor(status) {
  if (status === 'red') return '#ef4444'
  if (status === 'yellow') return '#f59e0b'
  return '#22c55e'
}

function getEmoji(status) {
  if (status === 'red') return '🔴'
  if (status === 'yellow') return '🟡'
  return '✅'
}

const styles = {
  strip: {
    background: '#0d1226',
    borderBottom: '1px solid #1e2a45',
    padding: '10px 24px',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  label: {
    fontSize: '11px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginRight: '8px',
  },
  pill: (color) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '9999px',
    border: `1px solid ${color}44`,
    background: `${color}11`,
    fontSize: '12px',
    fontWeight: '500',
    color,
    transition: 'all 0.5s ease',
  }),
}

export default function SystemHealthStrip({ faultState }) {
  const [activeStatuses, setActiveStatuses] = useState({})

  useEffect(() => {
    if (!faultState.active || !faultState.scenario) {
      setActiveStatuses({})
      return
    }

    if (faultState.scenario === 'full_cascade') {
      CASCADE_ORDER.forEach((svc, i) => {
        setTimeout(() => {
          setActiveStatuses((prev) => ({ ...prev, [svc]: 'red' }))
        }, i * 2000)
      })
    } else {
      setActiveStatuses(FAULT_MAP[faultState.scenario] || {})
    }
  }, [faultState.active, faultState.scenario])

  return (
    <div style={styles.strip}>
      <span style={styles.label}>Services</span>
      {SERVICES.map((svc) => {
        const status = activeStatuses[svc] || 'green'
        const color = getColor(status)
        return (
          <div key={svc} style={styles.pill(color)}>
            <span>{getEmoji(status)}</span>
            <span>{svc}</span>
          </div>
        )
      })}
    </div>
  )
}
