'use client'

import { useState, useEffect } from 'react'
import { StatsResponse, HealthResponse } from '@kexp-doubleplay/types'
import LoadingSpinner from './LoadingSpinner'

export default function StatsPanel() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'
        
        const [statsRes, healthRes] = await Promise.all([
          fetch(`${backendUrl}/api/stats`),
          fetch(`${backendUrl}/api/health`)
        ])
        
        if (statsRes.ok) {
          const statsData = await statsRes.json()
          setStats(statsData)
        }
        
        if (healthRes.ok) {
          const healthData = await healthRes.json()
          setHealth(healthData)
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 60000) // Update every minute
    
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg p-4">
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* System Status */}
      {health && (
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-3">System Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Scanner:</span>
              <span className={health.status === 'running' ? 'text-green-400' : 'text-yellow-400'}>
                {health.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span>KEXP API:</span>
              <span className={health.kexpApi.isHealthy ? 'text-green-400' : 'text-red-400'}>
                {health.kexpApi.isHealthy ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Uptime:</span>
              <span>{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span>
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <>
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="font-semibold mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total Double Plays:</span>
                <span className="font-bold">{stats.summary.totalDoublePlays}</span>
              </div>
              <div className="flex justify-between">
                <span>Unique Artists:</span>
                <span>{stats.summary.uniqueArtists}</span>
              </div>
              <div className="flex justify-between">
                <span>Unique DJs:</span>
                <span>{stats.summary.uniqueDJs}</span>
              </div>
              <div className="flex justify-between">
                <span>Time Span:</span>
                <span>{stats.summary.timespan.days} days</span>
              </div>
            </div>
          </div>

          {/* Top Artists */}
          {stats.topArtists.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="font-semibold mb-3">Top Artists</h3>
              <div className="space-y-2 text-sm">
                {stats.topArtists.slice(0, 5).map((artist, index) => (
                  <div key={artist.artist} className="flex justify-between">
                    <span className="truncate">{artist.artist}</span>
                    <span className="font-bold ml-2">{artist.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top DJs */}
          {stats.topDJs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="font-semibold mb-3">Top DJs</h3>
              <div className="space-y-2 text-sm">
                {stats.topDJs.slice(0, 5).map((dj, index) => (
                  <div key={dj.dj} className="flex justify-between">
                    <span className="truncate">{dj.dj}</span>
                    <span className="font-bold ml-2">{dj.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}