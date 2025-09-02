import { useState, useEffect } from 'react';
import { ApiResponse, DoublePlay } from '../types';

export interface EnhancedDoublePlay extends DoublePlay {
  youtube?: {
    videoId: string;
    url: string;
    title: string;
    channelTitle: string;
    thumbnail: string;
  };
}

export interface EnhancedApiResponse extends Omit<ApiResponse, 'doublePlays'> {
  doublePlays: EnhancedDoublePlay[];
  enhancedAt: string;
  youtubeApiEnabled: boolean;
}

export const useEnhancedData = () => {
  const [data, setData] = useState<EnhancedApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get data that was injected by the server
    const serverData = (window as any).ENHANCED_DOUBLE_PLAY_DATA;
    
    if (serverData) {
      setData(serverData);
    }
    
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error: null, // Server handles errors
    lastUpdate: data?.enhancedAt ? new Date(data.enhancedAt) : null
  };
};