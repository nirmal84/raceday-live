import React, { useState, useEffect, useRef } from 'react'
import useSimulatedData from '../hooks/useSimulatedData.js'

const FAULT_SCENARIOS = new Set(['memory_leak', 'full_cascade'])

const styles = {
  container: {
    background: '#0d1226',
    border: '1px solid #1e2a45',
    borderRadius: '10px',
    padding: '16px',
    transition: 'background 0.5s',
  },
  containerFaulted: {
    background: '#1a0808',
    border: '1px solid #ef4444',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
  },
  title: {
    fontWeight: '700',
    fontSize: '14px',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  titleFaulted: {
    color: '#ef4444',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
  },
  cell: (flash) => ({
    background: flash ? '#1d4ed833' : '#131c33',
    border: '1px solid #1e2a45',
    borderRadius: '6px',
    padding: '10px',
    transition: 'background 0.3s',
  }),
  cellFaulted: {
    background: '#2a0808',
    border: '1px solid #ef444444',
  },
  cellName: {
    fontSize: '11px',
    color: '#64748b',
    marginBottom: '4px',
  },
  cellMarket: {
    fontSize: '10px',
    color: '#475569',
    marginBottom: '6px',
  },
  cellPrice: (faulted) => ({
    fontSize: '20px',
    fontWeight: '700',
    color: faulted ? '#ef444488' : '#f59e0b',
    textDecoration: faulted ? 'line-through' : 'none',
  }),
  cellSpread: {
    fontSize: '11px',
    color: '#475569',
    marginTop: '2px',
  },
  offlineBadge: {
    fontSize: '11px',
    color: '#ef4444',
    fontWeight: '700',
    background: '#ef444422',
    padding: '2px 8px',
    borderRadius: '4px',
  },
}

export default function OddsEngineGrid({ faultState }) {
  const isFaulted = faultState.active && FAULT_SCENARIOS.has(faultState.scenario)
  const { markets, marketPrices, frozenMarkets } = useSimulatedData(faultState.active)
  const [flash, setFlash] = useState({})
  const prevPrices = useRef({})

  useEffect(() => {
    if (isFaulted) return
    const newFlash = {}
    markets.forEach((m) => {
      if (prevPrices.current[m.id] && prevPrices.current[m.id] !== marketPrices[m.id]?.price) {
        newFlash[m.id] = true
      }
    })
    prevPrices.current = Object.fromEntries(markets.map((m) => [m.id, marketPrices[m.id]?.price]))
    if (Object.keys(newFlash).length) {
      setFlash(newFlash)
      setTimeout(() => setFlash({}), 300)
    }
  }, [marketPrices, isFaulted, markets])

  const prices = isFaulted ? frozenMarkets : marketPrices

  return (
    <div style={{ ...styles.container, ...(isFaulted ? styles.containerFaulted : {}) }}>
      <div style={styles.header}>
        <div style={{ ...styles.title, ...(isFaulted ? styles.titleFaulted : {}) }}>
          {isFaulted ? 'ODDS ENGINE: OFFLINE' : 'Odds Engine'}
        </div>
        {isFaulted && <span style={styles.offlineBadge}>OFFLINE</span>}
      </div>

      <div style={styles.grid}>
        {markets.map((m) => {
          const p = prices[m.id]
          return (
            <div
              key={m.id}
              style={isFaulted ? { ...styles.cell(false), ...styles.cellFaulted } : styles.cell(flash[m.id])}
            >
              <div style={styles.cellName}>{m.name}</div>
              <div style={styles.cellMarket}>{m.market}</div>
              <div style={styles.cellPrice(isFaulted)}>
                {isFaulted ? '—' : p?.price?.toFixed(2) ?? '—'}
              </div>
              {!isFaulted && p && (
                <div style={styles.cellSpread}>spread {p.spread.toFixed(2)}</div>
              )}
              {isFaulted && p && (
                <div style={{ ...styles.cellSpread, color: '#ef444466' }}>
                  last: {p?.price?.toFixed(2)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
