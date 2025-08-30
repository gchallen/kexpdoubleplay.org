'use client'

import { useState, useEffect } from 'react'
import { StatsResponse, HealthResponse } from '@kexp-doubleplay/types'

export default function StatusFooter() {
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
        console.error('Failed to fetch status data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 60000) // Update every minute
    
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-500'
      case 'starting': return 'text-yellow-500'
      case 'error': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getStatusDot = (isHealthy: boolean) => {
    return isHealthy ? 'bg-green-500' : 'bg-red-500'
  }

  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <div className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center text-sm text-gray-500">Loading status...</div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {/* Main Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${health?.status === 'running' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                  <span className="text-sm font-medium">
                    Scanner: <span className={health ? getStatusColor(health.status) : 'text-gray-500'}>
                      {health?.status || 'Unknown'}
                    </span>
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${health ? getStatusDot(health.kexpApi.isHealthy) : 'bg-gray-500'}`}></div>
                  <span className="text-sm font-medium">
                    KEXP API: <span className={health?.kexpApi.isHealthy ? 'text-green-500' : 'text-red-500'}>
                      {health?.kexpApi.isHealthy ? 'Healthy' : 'Unhealthy'}
                    </span>
                  </span>
                </div>
              </div>
              
              <div className="text-sm text-gray-500">
                {health && (
                  <span>Uptime: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-lg font-bold" style={{ color: '#ff6600' }}>{stats.summary.totalDoublePlays}</div>
                  <div className="text-xs text-gray-500">Total Double Plays</div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-lg font-bold">{stats.summary.uniqueArtists}</div>
                  <div className="text-xs text-gray-500">Unique Artists</div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-lg font-bold">{stats.summary.uniqueDJs}</div>
                  <div className="text-xs text-gray-500">DJs</div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-lg font-bold">{stats.summary.timespan.days}</div>
                  <div className="text-xs text-gray-500">Days Monitored</div>
                </div>

                {stats.topArtists.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                    <div className="text-sm font-bold truncate">{stats.topArtists[0].artist}</div>
                    <div className="text-xs text-gray-500">Top Artist ({stats.topArtists[0].count})</div>
                  </div>
                )}

                {stats.topDJs.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                    <div className="text-sm font-bold truncate">{stats.topDJs[0].dj}</div>
                    <div className="text-xs text-gray-500">Top DJ ({stats.topDJs[0].count})</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </footer>
  )
}