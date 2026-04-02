import { useState, useEffect, useRef } from 'react'
import { API_BASE_URL } from '../config.js'

const MOCK = import.meta.env.VITE_MOCK_FAULT === 'true' || import.meta.env.VITE_API_BASE_URL === undefined

export default function useFaultState() {
  const [faultState, setFaultState] = useState({
    active: false,
    scenario: null,
    injectedAt: null,
    elapsedSeconds: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const elapsedRef = useRef(null)

  const startElapsedTimer = (injectedAt) => {
    if (elapsedRef.current) clearInterval(elapsedRef.current)
    elapsedRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(injectedAt).getTime()) / 1000)
      setFaultState((prev) => ({ ...prev, elapsedSeconds: elapsed }))
    }, 1000)
  }

  const stopElapsedTimer = () => {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current)
      elapsedRef.current = null
    }
  }

  useEffect(() => {
    if (MOCK) {
      setLoading(false)
      return
    }

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/fault/status`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const elapsed = data.active && data.injectedAt
          ? Math.floor((Date.now() - new Date(data.injectedAt).getTime()) / 1000)
          : 0
        setFaultState({ ...data, elapsedSeconds: elapsed })
        setError(null)

        if (data.active && data.injectedAt) {
          startElapsedTimer(data.injectedAt)
        } else {
          stopElapsedTimer()
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      clearInterval(interval)
      stopElapsedTimer()
    }
  }, [])

  return { faultState, loading, error }
}
