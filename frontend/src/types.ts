export interface KEXPPlay {
  airdate: string;
  artist: string;
  song: string;
  album: string;
  play_id: number;
  play_type: string;
  image_uri: string;
  thumbnail_uri: string;
  show: {
    id: number;
    name: string;
  };
}

export interface Play {
  timestamp: string;
  end_timestamp: string;
  play_id: number;
  duration: number;
  kexpPlay: KEXPPlay;
}

export interface DoublePlay {
  artist: string;
  title: string;
  plays: Play[];
  dj: string;
  show: string;
  classification: string;
}

export interface ApiResponse {
  counts: {
    total: number;
    legitimate: number;
    probable: number;
    possible: number;
  };
  doublePlays: DoublePlay[];
  startTime: string;
  endTime: string;
  metadata: {
    totalScanTimeMs: number;
    totalApiRequests: number;
  };
  retrievalStatus: string;
  totalCount: number;
}