import React, { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config.js'

const SCENARIOS = [
  {
    id: 'memory_leak',
    name: 'Memory Leak',
    desc: 'Odds engine heap exhaustion causes circuit breaker to open',
    services: ['odds-engine', 'bet-placement'],
  },
  {
    id: 'db_saturation',
    name: 'DB Saturation',
    desc: 'Connection pool exhausted on user-auth database',
    services: ['user-auth', 'bet-placement'],
  },
  {
    id: 'payment_timeout',
    name: 'Payment Timeout',
    desc: 'ANZ payment gateway upstream timeout cascade',
    services: ['payment-gateway'],
  },
  {
    id: 'full_cascade',
    name: 'Full Cascade',
    desc: 'Multi-service failure across all platform components',
    services: ['bet-placement', 'odds-engine', 'payment-gateway', 'user-auth'],
  },
]

function pad(n) { return String(n).padStart(2, '0') }

function formatTimer(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${pad(m)}:${pad(s)}`
}

function timerColor(secs) {
  if (secs >= 300) return '#ef4444'
  if (secs >= 120) return '#f97316'
  return '#f59e0b'
}

function formatInjectedAt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour12: false,
    timeZone: 'Australia/Sydney',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) + ' AEST'
}

const SCENARIO_NAMES = {
  memory_leak: 'Memory Leak',
  db_saturation: 'DB Saturation',
  payment_timeout: 'Payment Timeout',
  full_cascade: 'Full Cascade',
}

const styles = {
  overlay: (open) => ({
    position: 'fixed',
    inset: 0,
    background: open ? '#00000066' : 'transparent',
    pointerEvents: open ? 'auto' : 'none',
    zIndex: 300,
    transition: 'background 0.3s',
  }),
  drawer: (open) => ({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '380px',
    background: '#080d1a',
    borderLeft: '1px solid #1e2a45',
    transform: open ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }),
  drawerHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #1e2a45',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  drawerTitle: {
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    color: '#ef4444',
    textTransform: 'uppercase',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: 1,
  },
  body: {
    padding: '20px',
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.12em',
    color: '#475569',
    textTransform: 'uppercase',
    marginBottom: '10px',
  },
  scenarioBtn: (disabled) => ({
    width: '100%',
    textAlign: 'left',
    background: disabled ? '#0d1226' : '#0d1226',
    border: '1px solid #1e2a45',
    borderRadius: '8px',
    padding: '12px 14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginBottom: '8px',
    opacity: disabled ? 0.4 : 1,
    transition: 'border-color 0.2s',
  }),
  scenarioName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#e0e6f0',
    marginBottom: '3px',
  },
  scenarioDesc: {
    fontSize: '11px',
    color: '#64748b',
    marginBottom: '6px',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  chip: {
    fontSize: '10px',
    background: '#1e2a45',
    color: '#94a3b8',
    padding: '2px 7px',
    borderRadius: '4px',
  },
  activeFault: {
    background: '#1a0808',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  activeFaultHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  pulseDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#ef4444',
    boxShadow: '0 0 8px #ef4444',
    animation: 'pulse-dot 1s infinite',
  },
  activeFaultLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#ef4444',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  timer: (secs) => ({
    fontSize: '36px',
    fontWeight: '900',
    color: timerColor(secs),
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'monospace',
    textAlign: 'center',
    letterSpacing: '0.05em',
  }),
  timerLabel: {
    fontSize: '11px',
    color: '#475569',
    textAlign: 'center',
  },
  metaRow: {
    fontSize: '12px',
    color: '#94a3b8',
    display: 'flex',
    justifyContent: 'space-between',
  },
  metaVal: {
    color: '#e0e6f0',
    fontWeight: '600',
  },
  alarmRow: (inAlarm) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    background: '#0d1226',
    borderRadius: '6px',
    fontSize: '12px',
  }),
  alarmLabel: { color: '#94a3b8' },
  alarmStatus: (inAlarm) => ({
    fontWeight: '700',
    color: inAlarm ? '#ef4444' : '#f59e0b',
  }),
  resolveBtn: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    background: '#15803d',
    color: '#fff',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    letterSpacing: '0.05em',
  },
  reInjectBtn: (disabled) => ({
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #1e2a45',
    background: 'transparent',
    color: disabled ? '#1e2a45' : '#94a3b8',
    fontWeight: '600',
    fontSize: '13px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  confirmOverlay: {
    position: 'absolute',
    inset: 0,
    background: '#080d1aee',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    flexDirection: 'column',
    gap: '16px',
    padding: '32px',
  },
  confirmText: {
    color: '#e0e6f0',
    fontSize: '14px',
    textAlign: 'center',
    lineHeight: '1.6',
  },
  confirmBtns: {
    display: 'flex',
    gap: '10px',
    width: '100%',
  },
  confirmYes: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    background: '#ef4444',
    color: '#fff',
    fontWeight: '700',
    cursor: 'pointer',
  },
  confirmNo: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #1e2a45',
    background: 'transparent',
    color: '#94a3b8',
    fontWeight: '600',
    cursor: 'pointer',
  },
}

export default function AdminPanel({ open, onClose, faultState }) {
  const [confirm, setConfirm] = useState(null)
  const [loading, setLoading] = useState(false)

  const alarmVisible = faultState.active && faultState.elapsedSeconds >= 60

  const inject = async (scenario) => {
    setLoading(true)
    try {
      await fetch(`${API_BASE_URL}/fault/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      })
    } catch (e) {
      console.error('Inject failed:', e)
    } finally {
      setLoading(false)
      setConfirm(null)
    }
  }

  const resolve = async () => {
    setLoading(true)
    try {
      await fetch(`${API_BASE_URL}/fault/resolve`, { method: 'POST' })
    } catch (e) {
      console.error('Resolve failed:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay(open)} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.drawer(open)}>
        <style>{`
          @keyframes pulse-dot {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>

        {confirm && (
          <div style={styles.confirmOverlay}>
            <div style={styles.confirmText}>
              Inject <strong style={{ color: '#f59e0b' }}>{SCENARIO_NAMES[confirm]}</strong>?<br />
              This will trigger a CloudWatch alarm.
            </div>
            <div style={styles.confirmBtns}>
              <button style={styles.confirmYes} onClick={() => inject(confirm)} disabled={loading}>
                {loading ? 'Injecting...' : 'Confirm'}
              </button>
              <button style={styles.confirmNo} onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={styles.drawerHeader}>
          <div style={styles.drawerTitle}>ADMIN — FAULT INJECTION CONSOLE</div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.body}>
          {!faultState.active ? (
            <div>
              <div style={styles.sectionLabel}>Inject Fault</div>
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  style={styles.scenarioBtn(loading)}
                  onClick={() => setConfirm(s.id)}
                  disabled={loading}
                >
                  <div style={styles.scenarioName}>{s.name}</div>
                  <div style={styles.scenarioDesc}>{s.desc}</div>
                  <div style={styles.chips}>
                    {s.services.map((svc) => (
                      <span key={svc} style={styles.chip}>{svc}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <div style={styles.sectionLabel}>Active Fault</div>
              <div style={styles.activeFault}>
                <div style={styles.activeFaultHeader}>
                  <div style={styles.pulseDot} />
                  <span style={styles.activeFaultLabel}>System Degraded</span>
                </div>

                <div style={styles.timerLabel}>SYSTEM DEGRADED FOR</div>
                <div style={styles.timer(faultState.elapsedSeconds)}>
                  {formatTimer(faultState.elapsedSeconds || 0)}
                </div>

                <div style={styles.metaRow}>
                  <span>Injected at</span>
                  <span style={styles.metaVal}>{formatInjectedAt(faultState.injectedAt)}</span>
                </div>
                <div style={styles.metaRow}>
                  <span>Scenario</span>
                  <span style={styles.metaVal}>{SCENARIO_NAMES[faultState.scenario] || faultState.scenario}</span>
                </div>

                <div style={styles.alarmRow(alarmVisible)}>
                  <span style={styles.alarmLabel}>CloudWatch Alarm</span>
                  <span style={styles.alarmStatus(alarmVisible)}>
                    {alarmVisible ? 'IN ALARM 🔴' : 'PENDING 🟡'}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button style={styles.resolveBtn} onClick={resolve} disabled={loading}>
                  {loading ? 'Resolving...' : 'RESOLVE FAULT'}
                </button>
                <button style={styles.reInjectBtn(true)} disabled>
                  RE-INJECT (disabled while fault active)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
