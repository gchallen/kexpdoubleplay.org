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
  duration?: number;  // Duration in seconds between first play start and last play end
  classification?: 'legitimate' | 'partial' | 'mistake';  // Based on analysis of play patterns
}

export interface ScanStats {
  totalScanTimeMs: number;
  totalApiRequests: number;
  lastScanDuration: number;
  lastScanRequests: number;
  lastScanTime: string;
  scanDirection: 'forward' | 'backward' | 'mixed';
}

export interface DoublePlayData {
  startTime: string;
  endTime: string;
  doublePlays: DoublePlay[];
  scanStats?: ScanStats;
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