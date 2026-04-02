import { useState, useEffect, useRef } from 'react'

const RACES = [
  { id: 1, name: 'Flemington R3', venue: 'Flemington', distance: '1200m', horses: ['Thunderclap', 'Silver Arrow', 'Night Runner', 'Bold Spirit'] },
  { id: 2, name: 'Randwick R5', venue: 'Randwick', distance: '1600m', horses: ['Golden Flash', 'Storm Chaser', 'Rapid Fire', 'Iron Will'] },
  { id: 3, name: 'Caulfield R2', venue: 'Caulfield', distance: '2000m', horses: ['Desert Wind', 'Dark Horizon', 'Blue Flame', 'Star Dancer'] },
  { id: 4, name: 'Eagle Farm R4', venue: 'Eagle Farm', distance: '1400m', horses: ['King Cobra', 'Swift Shadow', 'Red Rocket', 'Velvet Blade'] },
  { id: 5, name: 'Morphettville R1', venue: 'Morphettville', distance: '1800m', horses: ['Last Chance', 'Lucky Break', 'Perfect Storm', 'Wild Card'] },
]

const MARKETS = [
  { id: 1, name: 'Flemington Win', market: 'WIN' },
  { id: 2, name: 'Randwick Place', market: 'PLACE' },
  { id: 3, name: 'Caulfield Win', market: 'WIN' },
  { id: 4, name: 'Eagle Farm Exacta', market: 'EXACTA' },
  { id: 5, name: 'Morph Win', market: 'WIN' },
  { id: 6, name: 'Flemington Quinella', market: 'QUINELLA' },
  { id: 7, name: 'Randwick Win', market: 'WIN' },
  { id: 8, name: 'Caulfield Place', market: 'PLACE' },
  { id: 9, name: 'Eagle Farm Win', market: 'WIN' },
]

function randomDrift(value, maxDrift = 0.2) {
  return Math.max(1.01, +(value + (Math.random() - 0.5) * 2 * maxDrift).toFixed(2))
}

function initialOdds(horses) {
  return horses.reduce((acc, h) => ({ ...acc, [h]: +(2 + Math.random() * 8).toFixed(2) }), {})
}

function initialMarketPrices() {
  return MARKETS.reduce((acc, m) => ({
    ...acc,
    [m.id]: { price: +(2 + Math.random() * 15).toFixed(2), spread: +(Math.random() * 0.3).toFixed(2) },
  }), {})
}

export default function useSimulatedData(faultActive) {
  const [races, setRaces] = useState(() =>
    RACES.map((r) => ({
      ...r,
      odds: initialOdds(r.horses),
      countdown: 60 + Math.floor(Math.random() * 420),
    }))
  )
  const [dashboard, setDashboard] = useState({
    betsPlaced: 14200,
    throughput: Array.from({ length: 20 }, () => 110 + Math.floor(Math.random() * 20)),
    activeUsers: 18400,
  })
  const [marketPrices, setMarketPrices] = useState(initialMarketPrices)
  const [frozenOdds] = useState(() => RACES.map((r) => initialOdds(r.horses)))
  const [frozenMarkets] = useState(initialMarketPrices)

  const intervalsRef = useRef([])

  const clearAll = () => {
    intervalsRef.current.forEach(clearInterval)
    intervalsRef.current = []
  }

  useEffect(() => {
    clearAll()

    if (!faultActive) {
      // Odds drift every 3s
      intervalsRef.current.push(setInterval(() => {
        setRaces((prev) =>
          prev.map((r) => ({
            ...r,
            odds: Object.fromEntries(Object.entries(r.odds).map(([h, o]) => [h, randomDrift(o)])),
            countdown: Math.max(0, r.countdown - 3),
          }))
        )
      }, 3000))

      // Dashboard counters
      intervalsRef.current.push(setInterval(() => {
        setDashboard((prev) => ({
          betsPlaced: prev.betsPlaced + 1 + Math.floor(Math.random() * 5),
          throughput: [...prev.throughput.slice(1), 110 + Math.floor(Math.random() * 20)],
          activeUsers: 18400 + Math.floor((Math.random() - 0.5) * 400),
        }))
      }, 2000))

      // Market prices every 2s
      intervalsRef.current.push(setInterval(() => {
        setMarketPrices((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([id, v]) => [
              id,
              { price: randomDrift(v.price, 0.15), spread: +(Math.random() * 0.3).toFixed(2) },
            ])
          )
        )
      }, 2000))
    } else {
      // Fault: users dropping
      intervalsRef.current.push(setInterval(() => {
        setDashboard((prev) => ({
          ...prev,
          throughput: [...prev.throughput.slice(1), Math.max(0, 2 + Math.floor(Math.random() * 5))],
          activeUsers: Math.max(0, prev.activeUsers - 50 - Math.floor(Math.random() * 150)),
        }))
      }, 3000))
    }

    return clearAll
  }, [faultActive])

  return {
    races,
    frozenOdds,
    dashboard,
    marketPrices,
    frozenMarkets,
    markets: MARKETS,
  }
}
