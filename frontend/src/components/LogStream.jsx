import React, { useState, useEffect, useRef } from 'react'

const HEALTHY_LOGS = [
  '[INFO] bet-placement-service: request processed in 142ms',
  '[INFO] odds-engine: market sync complete — 47 markets updated',
  '[INFO] user-auth: session validated uid=usr_8821',
  '[INFO] payment-gateway: transaction processed txn=TXN_44821',
  '[INFO] bet-placement-service: request processed in 98ms',
  '[INFO] odds-engine: market sync complete — 52 markets updated',
  '[INFO] user-auth: session validated uid=usr_9312',
  '[INFO] payment-gateway: transaction processed txn=TXN_44822',
]

const FAULT_LOGS = {
  memory_leak: [
    '[ERROR] odds-engine: OutOfMemoryError — heap exhausted (2048/2048MB)',
    '[ERROR] bet-placement-service: upstream timeout waiting for odds-engine (8423ms)',
    '[WARN]  odds-engine: GC overhead limit exceeded',
    '[ERROR] bet-placement-service: circuit breaker OPEN — odds-engine',
  ],
  db_saturation: [
    '[ERROR] user-auth: connection pool exhausted (500/500 connections)',
    '[ERROR] user-auth: query timeout after 30000ms',
    '[WARN]  bet-placement-service: auth check degraded — retrying (attempt 3/3)',
  ],
  payment_timeout: [
    '[ERROR] payment-gateway: upstream timeout — provider_id=ANZ_PAY (30000ms)',
    '[WARN]  payment-gateway: retry queue depth 847 — processing delayed',
  ],
  full_cascade: [
    '[ERROR] odds-engine: OutOfMemoryError — heap exhausted (2048/2048MB)',
    '[ERROR] bet-placement-service: upstream timeout waiting for odds-engine (8423ms)',
    '[WARN]  odds-engine: GC overhead limit exceeded',
    '[ERROR] user-auth: connection pool exhausted (500/500 connections)',
    '[ERROR] user-auth: query timeout after 30000ms',
    '[ERROR] payment-gateway: upstream timeout — provider_id=ANZ_PAY (30000ms)',
    '[WARN]  payment-gateway: retry queue depth 847 — processing delayed',
    '[ERROR] bet-placement-service: circuit breaker OPEN — odds-engine',
  ],
}

function lineColor(line) {
  if (line.startsWith('[ERROR]')) return '#ef4444'
  if (line.startsWith('[WARN]')) return '#f59e0b'
  return '#22c55e'
}

function timestamp() {
  return new Date().toLocaleTimeString('en-AU', { hour12: false })
}

const styles = {
  container: {
    background: '#060910',
    border: '1px solid #1e2a45',
    borderRadius: '10px',
    padding: '12px 16px',
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '11px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  dot: (active) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: active ? '#22c55e' : '#ef4444',
    boxShadow: active ? '0 0 6px #22c55e' : '0 0 6px #ef4444',
  }),
  stream: {
    height: '160px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  line: (color) => ({
    fontSize: '11px',
    color,
    whiteSpace: 'pre',
    lineHeight: '1.6',
  }),
  ts: {
    color: '#334155',
    marginRight: '6px',
  },
}

export default function LogStream({ faultState }) {
  const [lines, setLines] = useState([])
  const bottomRef = useRef(null)
  const faultLogsRef = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      const isHealthy = !faultState.active || !faultState.scenario
      const faultPool = faultState.scenario ? FAULT_LOGS[faultState.scenario] : []

      let newLine
      if (!isHealthy && Math.random() < 0.6) {
        newLine = faultPool[faultLogsRef.current % faultPool.length]
        faultLogsRef.current++
      } else {
        newLine = HEALTHY_LOGS[Math.floor(Math.random() * HEALTHY_LOGS.length)]
      }

      setLines((prev) => {
        const updated = [...prev, { text: newLine, ts: timestamp() }]
        return updated.slice(-50)
      })
    }, faultState.active ? 1000 + Math.random() * 1000 : 3000 + Math.random() * 2000)

    return () => clearInterval(interval)
  }, [faultState.active, faultState.scenario])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.dot(!faultState.active)} />
        <span style={styles.title}>Log Stream</span>
      </div>
      <div style={styles.stream}>
        {lines.map((l, i) => (
          <div key={i} style={styles.line(lineColor(l.text))}>
            <span style={styles.ts}>{l.ts}</span>{l.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
