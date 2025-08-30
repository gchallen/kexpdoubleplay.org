'use client'

import { useState, useEffect } from 'react'
import { DoublePlay } from '@kexp-doubleplay/types'
import DoublePlayCard from './DoublePlayCard'

export default function DoublePlayList() {
  const [doublePlays, setDoublePlays] = useState<DoublePlay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDoublePlays = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'
        const response = await fetch(`${backendUrl}/api/double-plays`)
        
        if (response.ok) {
          const data = await response.json()
          setDoublePlays(data.doublePlays || [])
        }
      } catch (err) {
        // Fail silently
      } finally {
        setLoading(false)
      }
    }

    fetchDoublePlays()
    const interval = setInterval(fetchDoublePlays, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Loading...
      </div>
    )
  }

  if (doublePlays.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No double plays found yet.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {doublePlays.map((doublePlay, index) => (
        <DoublePlayCard key={`${doublePlay.artist}-${doublePlay.title}-${index}`} doublePlay={doublePlay} />
      ))}
    </div>
  )
}