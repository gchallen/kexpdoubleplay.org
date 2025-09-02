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
        {/* KEXP-style play button */}
        {doublePlay.youtube && (
          <div className="shrink-0 mr-3">
            <a 
              href={doublePlay.youtube.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
              title="Watch on YouTube"
            >
              <svg 
                className="w-8 h-8 hover:opacity-80 transition-opacity duration-200" 
                width="32" 
                height="32" 
                viewBox="0 0 66 66" 
                version="1.1" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <g stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
                  <g className="fill-black">
                    <path d="M32.92,0.33 C14.9278648,0.330000848 0.341841956,14.9145326 0.340001705,32.9066677 C0.338161454,50.8988028 14.9212005,65.486318 32.9133354,65.4899993 C50.9054702,65.4936807 65.4944776,50.9121344 65.5,32.92 C65.4834701,14.9317947 50.9081993,0.352050299 32.92,0.33 L32.92,0.33 Z M32.92,60.5 C17.6879866,60.5 5.34,48.1520134 5.34,32.92 C5.34,17.6879866 17.6879866,5.34 32.92,5.34 C48.1520134,5.34 60.5,17.6879866 60.5,32.92 C60.4834659,48.1451595 48.1451595,60.4834659 32.92,60.5 L32.92,60.5 Z" id="Shape"></path>
                    <polygon points="29.28 17.16 25.94 20.51 38.16 32.73 25.46 45.42 28.83 48.79 41.52 36.1 41.55 36.13 44.91 32.78"></polygon>
                  </g>
                </g>
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