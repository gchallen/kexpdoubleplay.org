import Image from 'next/image'
import { DoublePlay } from '@kexp-doubleplay/types'

interface DoublePlayCardProps {
  doublePlay: DoublePlay
}

export default function DoublePlayCard({ doublePlay }: DoublePlayCardProps) {
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    })
  }

  const formatFullDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    })
  }

  const getDoublePlaySummary = () => {
    const playTimes = doublePlay.plays.map(play => formatTime(play.timestamp)).join(', ')
    const date = formatFullDate(doublePlay.plays[0].timestamp)
    const dj = doublePlay.dj
    const show = doublePlay.show
    
    // If we have DJ and/or show info, use it
    if (dj || show) {
      let byLine = 'Double-played '
      if (dj && show) {
        byLine += `by ${dj} on ${show}`
      } else if (dj) {
        byLine += `by ${dj}`
      } else if (show) {
        byLine += `on ${show}`
      }
      byLine += ` on ${date} (${playTimes})`
      return byLine
    }
    
    // Fallback if no DJ or show info
    return `Double-played on ${date} (${playTimes})`
  }

  const firstPlay = doublePlay.plays[0]
  const album = firstPlay?.kexpPlay?.album
  const imageUri = firstPlay?.kexpPlay?.image_uri || firstPlay?.kexpPlay?.thumbnail_uri

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 pb-6 mb-6">
      <div className="flex items-start gap-4">
        {/* Time column - left side like KEXP */}
        <div className="text-sm text-gray-500 dark:text-gray-400 min-w-[60px] pt-1">
          <div>{formatTime(doublePlay.plays[0].timestamp)}</div>
          <div className="text-xs">{formatDate(doublePlay.plays[0].timestamp)}</div>
        </div>
        
        {/* Content - song details */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg leading-tight mb-1">{doublePlay.title}</h3>
          <p className="text-gray-700 dark:text-gray-300 mb-1">{doublePlay.artist}</p>
          {album && (
            <p className="text-sm italic text-gray-500 dark:text-gray-400 mb-2">{album}</p>
          )}
          
          {/* Double play summary */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {getDoublePlaySummary()}
          </div>
        </div>
        
        {/* Album artwork - duplicate side by side for double plays */}
        <div className="flex gap-2">
          {doublePlay.plays.map((play, index) => (
            imageUri && (
              <div key={play.play_id} className="flex-shrink-0">
                <Image
                  src={imageUri}
                  alt={`${album} album artwork`}
                  width={64}
                  height={64}
                  className="rounded"
                  unoptimized
                />
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  )
}