export interface KEXPPlay {
  airdate: string;
  artist: string;
  song: string;
  album?: string;
  play_id: number;
  play_type: 'trackplay' | 'airbreak' | string;
  image_uri?: string;
  thumbnail_uri?: string;
  show?: {
    id: number;
    name: string;
  };
  host?: {
    id: number;
    name: string;
  };
}

export interface DoublePlay {
  artist: string;
  title: string;
  plays: Array<{
    timestamp: string;
    end_timestamp?: string;  // End time when the song finished playing
    play_id: number;
  }>;
  dj?: string;
  show?: string;
}

export interface DoublePlayData {
  startTime: string;
  endTime: string;
  doublePlays: DoublePlay[];
}

export interface Config {
  dataFilePath: string;
  apiBaseUrl: string;
  rateLimitDelay: number;
  scanIntervalMinutes: number;
  maxHoursPerRequest: number;
  apiPort: number;
  historicalScanStopDate?: string;
}