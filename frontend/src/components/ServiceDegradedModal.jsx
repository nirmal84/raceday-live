import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'raceday_modal_dismissed_at'

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#00000088',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: '#0d1226',
    border: '1px solid #ef4444',
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '420px',
    width: '90%',
    boxShadow: '0 20px 60px #00000088',
  },
  icon: {
    fontSize: '36px',
    marginBottom: '16px',
    textAlign: 'center',
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#fca5a5',
    marginBottom: '12px',
    textAlign: 'center',
  },
  body: {
    fontSize: '14px',
    color: '#94a3b8',
    lineHeight: '1.6',
    textAlign: 'center',
    marginBottom: '24px',
  },
  btn: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    background: '#1e2a45',
    color: '#e0e6f0',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
  },
}

export default function ServiceDegradedModal({ faultState }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!faultState.active || !faultState.injectedAt) {
      setVisible(false)
      return
    }

    const dismissedAt = localStorage.getItem(STORAGE_KEY)
    if (dismissedAt === faultState.injectedAt) return

    const timer = setTimeout(() => setVisible(true), 3000)
    return () => clearTimeout(timer)
  }, [faultState.active, faultState.injectedAt])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, faultState.injectedAt)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.icon}>⚠️</div>
        <div style={styles.title}>We're experiencing technical difficulties</div>
        <div style={styles.body}>
          Our team has been notified and is working to restore service.
          Bet placement is temporarily unavailable.
        </div>
        <button style={styles.btn} onClick={dismiss}>Dismiss</button>
      </div>
    </div>
  )
}
