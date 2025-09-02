import React from 'react';
import { EnhancedDoublePlay } from '../hooks/useEnhancedData';

interface DoublePlayItemProps {
  doublePlay: EnhancedDoublePlay;
}

export const DoublePlayItem: React.FC<DoublePlayItemProps> = ({ doublePlay }) => {
  const firstPlay = doublePlay.plays[0];
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getImageUrl = (play: any) => {
    return play.kexpPlay.thumbnail_uri || play.kexpPlay.image_uri || '';
  };

  return (
    <div className="playlist-item">
      <div className="flex items-center w-full">
        {/* Play button */}
        {doublePlay.youtube && (
          <div className="shrink-0 mr-3">
            <a 
              href={doublePlay.youtube.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center w-8 h-8 bg-white hover:bg-gray-100 rounded-full border-2 border-white hover:border-gray-100 transition-all duration-200"
              title="Watch on YouTube"
            >
              <svg 
                className="w-3 h-3 text-black ml-0.5 group-hover:text-gray-800" 
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z"/>
              </svg>
            </a>
          </div>
        )}

        <div className="timestamp text-xs text-gray-400 w-32 shrink-0">
          {formatTime(firstPlay.timestamp)}
        </div>
        
        <div className="track-info flex-1 mx-4">
          <h3 className="artist-name text-white font-normal text-base mb-1">
            {doublePlay.artist}
          </h3>
          <h5 className="track-title text-gray-300 font-light italic text-sm mb-1">
            {doublePlay.title}
          </h5>
          <div className="text-gray-400 text-xs">
            <span>{firstPlay.kexpPlay.album}</span>
            {doublePlay.dj && doublePlay.show && (
              <span className="ml-2">
                • {doublePlay.dj} on {doublePlay.show}
              </span>
            )}
          </div>
        </div>

        {/* Double album covers on the right */}
        <div className="flex gap-2 shrink-0">
          <img 
            src={getImageUrl(firstPlay)} 
            alt={`${doublePlay.artist} - ${doublePlay.title}`}
            className="album-cover w-16 h-16 object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
            onLoad={(e) => {
              // Successfully loaded
            }}
          />
          <img 
            src={getImageUrl(firstPlay)} 
            alt={`${doublePlay.artist} - ${doublePlay.title} (second play)`}
            className="album-cover w-16 h-16 object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
            onLoad={(e) => {
              // Successfully loaded
            }}
          />
        </div>
      </div>
    </div>
  );
};