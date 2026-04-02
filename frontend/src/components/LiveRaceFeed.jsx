import React, { useState } from 'react'
import useSimulatedData from '../hooks/useSimulatedData.js'

const FAULT_SCENARIOS = new Set(['memory_leak', 'full_cascade'])

function formatCountdown(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const styles = {
  card: (faulted) => ({
    background: faulted ? '#1a0808' : '#0d1226',
    border: `1px solid ${faulted ? '#ef4444' : '#1e2a45'}`,
    borderRadius: '8px',
    padding: '14px',
    position: 'relative',
    animation: faulted ? 'pulse-border 1.5s infinite' : 'none',
    overflow: 'hidden',
  }),
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '10px',
  },
  raceName: {
    fontWeight: '600',
    fontSize: '13px',
    color: '#e0e6f0',
  },
  raceMeta: {
    fontSize: '11px',
    color: '#64748b',
  },
  countdown: (faulted) => ({
    fontSize: '11px',
    color: faulted ? '#ef4444' : '#f59e0b',
    fontWeight: '600',
  }),
  horse: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    fontSize: '12px',
    borderBottom: '1px solid #1e2a45',
  },
  horseName: { color: '#94a3b8' },
  odds: (faulted) => ({
    fontWeight: '700',
    color: faulted ? '#ef444488' : '#f59e0b',
    textDecoration: faulted ? 'line-through' : 'none',
  }),
  betBtn: (faulted, loading) => ({
    marginTop: '10px',
    width: '100%',
    padding: '7px',
    borderRadius: '6px',
    border: 'none',
    background: faulted || loading ? '#1e2a45' : '#1d4ed8',
    color: faulted ? '#ef4444' : '#fff',
    fontWeight: '600',
    fontSize: '12px',
    cursor: faulted ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  }),
  errorOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    background: '#ef444422',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '13px',
    color: '#ef4444',
    letterSpacing: '0.05em',
    pointerEvents: 'none',
    zIndex: 2,
  },
  toast: {
    position: 'fixed',
    bottom: '80px',
    right: '24px',
    background: '#22c55e',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '13px',
    zIndex: 100,
    boxShadow: '0 4px 16px #0006',
  },
  container: {
    background: '#0d1226',
    border: '1px solid #1e2a45',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  title: {
    fontWeight: '700',
    fontSize: '14px',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '4px',
  },
}

export default function LiveRaceFeed({ faultState }) {
  const isFaulted = faultState.active && FAULT_SCENARIOS.has(faultState.scenario)
  const { races, frozenOdds } = useSimulatedData(faultState.active)
  const [betStates, setBetStates] = useState({})
  const [toast, setToast] = useState(null)

  const handleBet = (raceId) => {
    if (isFaulted) return
    setBetStates((prev) => ({ ...prev, [raceId]: 'loading' }))
    setTimeout(() => {
      setBetStates((prev) => ({ ...prev, [raceId]: null }))
      setToast('Bet placed successfully!')
      setTimeout(() => setToast(null), 2500)
    }, 800)
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 0 #ef444444; }
          50% { box-shadow: 0 0 0 6px #ef444411; }
        }
      `}</style>

      <div style={styles.title}>Live Race Feed</div>

      {races.map((race, idx) => {
        const displayOdds = isFaulted ? frozenOdds[idx] : race.odds
        const betState = betStates[race.id]

        return (
          <div key={race.id} style={styles.card(isFaulted)}>
            {isFaulted && <div style={styles.errorOverlay}>ODDS ENGINE UNAVAILABLE</div>}

            <div style={styles.cardHeader}>
              <div>
                <div style={styles.raceName}>{race.name}</div>
                <div style={styles.raceMeta}>{race.venue} · {race.distance}</div>
              </div>
              <div style={styles.countdown(isFaulted)}>
                {isFaulted ? 'SUSPENDED' : `⏱ ${formatCountdown(race.countdown)}`}
              </div>
            </div>

            {race.horses.map((h) => (
              <div key={h} style={styles.horse}>
                <span style={styles.horseName}>{h}</span>
                <span style={styles.odds(isFaulted)}>{displayOdds[h]?.toFixed(2)}</span>
              </div>
            ))}

            <button
              style={styles.betBtn(isFaulted, betState === 'loading')}
              onClick={() => handleBet(race.id)}
              disabled={isFaulted || betState === 'loading'}
            >
              {betState === 'loading' && <span>⏳</span>}
              {isFaulted
                ? 'Service Unavailable — bet-placement-service [503]'
                : betState === 'loading'
                ? 'Processing...'
                : 'Place Bet'}
            </button>
          </div>
        )
      })}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  )
}
