import React from 'react'
import useSimulatedData from '../hooks/useSimulatedData.js'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

const styles = {
  container: {
    background: '#0d1226',
    border: '1px solid #1e2a45',
    borderRadius: '10px',
    padding: '16px',
    position: 'relative',
    overflow: 'hidden',
  },
  title: {
    fontWeight: '700',
    fontSize: '14px',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '16px',
  },
  metricsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  metricLabel: {
    fontSize: '11px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  metricValue: (faulted) => ({
    fontSize: '28px',
    fontWeight: '700',
    color: faulted ? '#ef4444' : '#f59e0b',
    fontVariantNumeric: 'tabular-nums',
  }),
  metricDelta: (faulted) => ({
    fontSize: '12px',
    color: faulted ? '#ef4444' : '#22c55e',
  }),
  watermark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(-20deg)',
    fontSize: '48px',
    fontWeight: '900',
    color: '#ef444422',
    letterSpacing: '0.1em',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    zIndex: 10,
  },
  chartWrapper: {
    height: '60px',
    marginTop: '4px',
  },
}

export default function WageringDashboard({ faultState }) {
  const isFaulted = faultState.active
  const { dashboard } = useSimulatedData(faultState.active)

  const throughputData = dashboard.throughput.map((v, i) => ({ i, v }))

  return (
    <div style={styles.container}>
      {isFaulted && <div style={styles.watermark}>DEGRADED</div>}

      <div style={styles.title}>Wagering Dashboard</div>

      <div style={styles.metricsGrid}>
        <div style={styles.metric}>
          <div style={styles.metricLabel}>Bets Placed (Today)</div>
          <div style={styles.metricValue(isFaulted)}>
            {isFaulted ? '—' : dashboard.betsPlaced.toLocaleString()}
          </div>
          {isFaulted && <div style={styles.metricDelta(true)}>— service unavailable</div>}
        </div>

        <div style={styles.metric}>
          <div style={styles.metricLabel}>Throughput (bets/sec)</div>
          <div style={styles.metricValue(isFaulted)}>
            {isFaulted ? dashboard.throughput[dashboard.throughput.length - 1] : dashboard.throughput[dashboard.throughput.length - 1]}
          </div>
          <div style={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={throughputData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={isFaulted ? '#ef4444' : '#3b82f6'}
                  dot={false}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{ background: '#0d1226', border: '1px solid #1e2a45', fontSize: '11px' }}
                  formatter={(v) => [`${v} bets/sec`]}
                  labelFormatter={() => ''}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={styles.metric}>
          <div style={styles.metricLabel}>Active Users</div>
          <div style={styles.metricValue(isFaulted)}>
            {dashboard.activeUsers.toLocaleString()}
          </div>
          {isFaulted && (
            <div style={styles.metricDelta(true)}>↓ users dropping</div>
          )}
        </div>
      </div>
    </div>
  )
}
