import React, { useEffect, useState } from 'react'
import SystemHealthStrip from './components/SystemHealthStrip.jsx'
import LiveRaceFeed from './components/LiveRaceFeed.jsx'
import WageringDashboard from './components/WageringDashboard.jsx'
import OddsEngineGrid from './components/OddsEngineGrid.jsx'
import LogStream from './components/LogStream.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import ServiceDegradedModal from './components/ServiceDegradedModal.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import useFaultState from './hooks/useFaultState.js'

const styles = {
  app: {
    minHeight: '100vh',
    background: '#0a0e1a',
    color: '#e0e6f0',
  },
  header: {
    background: '#0d1226',
    borderBottom: '1px solid #1e2a45',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: '20px',
    fontWeight: '700',
    letterSpacing: '0.05em',
    color: '#fff',
  },
  logoAccent: {
    color: '#f59e0b',
  },
  headerRight: {
    fontSize: '12px',
    color: '#64748b',
  },
  main: {
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
}

export default function App() {
  const { faultState, loading } = useFaultState()
  const [adminOpen, setAdminOpen] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setAdminOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (loading) {
    return (
      <div style={{ ...styles.app, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#64748b' }}>Connecting...</span>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      <ErrorBanner faultState={faultState} />

      <header style={styles.header}>
        <div style={styles.logo}>
          Race<span style={styles.logoAccent}>Day</span> Live
        </div>
        <div style={styles.headerRight}>
          Press Ctrl+Shift+D for admin panel
        </div>
      </header>

      <SystemHealthStrip faultState={faultState} />

      <main style={styles.main}>
        <div style={styles.row}>
          <LiveRaceFeed faultState={faultState} />
          <WageringDashboard faultState={faultState} />
        </div>
        <OddsEngineGrid faultState={faultState} />
        <LogStream faultState={faultState} />
      </main>

      <ServiceDegradedModal faultState={faultState} />
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} faultState={faultState} />
    </div>
  )
}
