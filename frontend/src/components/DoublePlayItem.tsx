import React from 'react';
import { EnhancedDoublePlay } from '../hooks/useEnhancedData';

interface DoublePlayItemProps {
  doublePlay: EnhancedDoublePlay;
}

export const DoublePlayItem: React.FC<DoublePlayItemProps> = ({ doublePlay }) => {
  const firstPlay = doublePlay.plays[0];
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
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
        <div className="timestamp text-xs text-gray-400 w-24 shrink-0">
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
            {doublePlay.youtube && (
              <div className="mt-1">
                <a 
                  href={doublePlay.youtube.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-xs"
                >
                  ▶ Watch on YouTube
                </a>
              </div>
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