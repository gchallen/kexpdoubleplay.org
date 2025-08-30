import { DoublePlayDetector } from './detector';
import { KEXPPlay, DoublePlay } from './types';

describe('DoublePlayDetector', () => {
  let detector: DoublePlayDetector;

  beforeEach(() => {
    detector = new DoublePlayDetector();
  });

  describe('detectDoublePlays', () => {
    it('should detect a simple double play', () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T15:08:00Z',
          artist: 'Test Artist',
          song: 'Test Song',
          play_id: 1,
          play_type: 'track',
          host: { id: 1, name: 'DJ Test' },
          show: { id: 1, name: 'Morning Show' }
        },
        {
          airdate: '2025-04-10T15:12:00Z',
          artist: 'Test Artist',
          song: 'Test Song',
          play_id: 2,
          play_type: 'track',
          host: { id: 1, name: 'DJ Test' },
          show: { id: 1, name: 'Morning Show' }
        }
      ];

      const doublePlays = detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].artist).toBe('Test Artist');
      expect(doublePlays[0].title).toBe('Test Song');
      expect(doublePlays[0].plays).toHaveLength(2);
      expect(doublePlays[0].dj).toBe('DJ Test');
      expect(doublePlays[0].show).toBe('Morning Show');
    });

    it('should detect double play with air break in between', () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T10:08:00Z',
          artist: 'Test Artist',
          song: 'Test Song',
          play_id: 1,
          play_type: 'track'
        },
        {
          airdate: '2025-04-10T10:10:00Z',
          artist: '',
          song: '',
          play_id: 2,
          play_type: 'airbreak'
        },
        {
          airdate: '2025-04-10T10:12:00Z',
          artist: 'Test Artist',
          song: 'Test Song',
          play_id: 3,
          play_type: 'track'
        }
      ];

      const doublePlays = detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].plays).toHaveLength(2);
      expect(doublePlays[0].plays[0].play_id).toBe(1);
      expect(doublePlays[0].plays[1].play_id).toBe(3);
    });

    it('should detect triple play', () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T10:00:00Z',
          artist: 'Band',
          song: 'Hit',
          play_id: 1,
          play_type: 'track'
        },
        {
          airdate: '2025-04-10T10:04:00Z',
          artist: 'Band',
          song: 'Hit',
          play_id: 2,
          play_type: 'track'
        },
        {
          airdate: '2025-04-10T10:08:00Z',
          artist: 'Band',
          song: 'Hit',
          play_id: 3,
          play_type: 'track'
        }
      ];

      const doublePlays = detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].plays).toHaveLength(3);
    });

    it('should not detect double play when different songs', () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T10:00:00Z',
          artist: 'Band',
          song: 'Song 1',
          play_id: 1,
          play_type: 'track'
        },
        {
          airdate: '2025-04-10T10:04:00Z',
          artist: 'Band',
          song: 'Song 2',
          play_id: 2,
          play_type: 'track'
        }
      ];

      const doublePlays = detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(0);
    });

    it('should handle case-insensitive matching', () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T10:00:00Z',
          artist: 'The Band',
          song: 'Great Song',
          play_id: 1,
          play_type: 'track'
        },
        {
          airdate: '2025-04-10T10:04:00Z',
          artist: 'THE BAND',
          song: 'GREAT SONG',
          play_id: 2,
          play_type: 'track'
        }
      ];

      const doublePlays = detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].plays).toHaveLength(2);
    });
  });

  describe('mergeDoublePlays', () => {
    it('should merge overlapping double plays', () => {
      const existing: DoublePlay[] = [
        {
          artist: 'Band',
          title: 'Song',
          plays: [
            { timestamp: '2025-04-10T10:00:00Z', play_id: 1 },
            { timestamp: '2025-04-10T10:04:00Z', play_id: 2 }
          ]
        }
      ];

      const newPlays: DoublePlay[] = [
        {
          artist: 'Band',
          title: 'Song',
          plays: [
            { timestamp: '2025-04-10T10:04:00Z', play_id: 2 },
            { timestamp: '2025-04-10T10:08:00Z', play_id: 3 }
          ]
        }
      ];

      const merged = detector.mergeDoublePlays(existing, newPlays);

      expect(merged).toHaveLength(1);
      expect(merged[0].plays).toHaveLength(3);
      expect(merged[0].plays.map(p => p.play_id)).toEqual([1, 2, 3]);
    });

    it('should not merge non-overlapping double plays', () => {
      const existing: DoublePlay[] = [
        {
          artist: 'Band',
          title: 'Song',
          plays: [
            { timestamp: '2025-04-10T10:00:00Z', play_id: 1 },
            { timestamp: '2025-04-10T10:04:00Z', play_id: 2 }
          ]
        }
      ];

      const newPlays: DoublePlay[] = [
        {
          artist: 'Band',
          title: 'Song',
          plays: [
            { timestamp: '2025-04-11T10:00:00Z', play_id: 3 },
            { timestamp: '2025-04-11T10:04:00Z', play_id: 4 }
          ]
        }
      ];

      const merged = detector.mergeDoublePlays(existing, newPlays);

      expect(merged).toHaveLength(2);
    });

    it('should add DJ and show info when missing', () => {
      const existing: DoublePlay[] = [
        {
          artist: 'Band',
          title: 'Song',
          plays: [
            { timestamp: '2025-04-10T10:00:00Z', play_id: 1 },
            { timestamp: '2025-04-10T10:04:00Z', play_id: 2 }
          ]
        }
      ];

      const newPlays: DoublePlay[] = [
        {
          artist: 'Band',
          title: 'Song',
          plays: [
            { timestamp: '2025-04-10T10:04:00Z', play_id: 2 },
            { timestamp: '2025-04-10T10:08:00Z', play_id: 3 }
          ],
          dj: 'DJ Name',
          show: 'Show Name'
        }
      ];

      const merged = detector.mergeDoublePlays(existing, newPlays);

      expect(merged).toHaveLength(1);
      expect(merged[0].dj).toBe('DJ Name');
      expect(merged[0].show).toBe('Show Name');
      expect(merged[0].plays).toHaveLength(3);
    });
  });
});