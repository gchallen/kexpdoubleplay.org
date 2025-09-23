import { DoublePlayDetector } from './detector';
import { KEXPPlay, DoublePlay } from '@kexp-doubleplay/types';

describe('DoublePlayDetector', () => {
  let detector: DoublePlayDetector;

  beforeEach(() => {
    detector = new DoublePlayDetector();
  });

  describe('detectDoublePlays', () => {
    it('should detect a simple double play', async () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T15:08:00Z',
          artist: 'Test Artist',
          song: 'Test Song',
          play_id: 1,
          play_type: 'trackplay',
          host: { id: 1, name: 'DJ Test' },
          show: { id: 1, name: 'Morning Show' }
        },
        {
          airdate: '2025-04-10T15:12:00Z',
          artist: 'Test Artist',
          song: 'Test Song',
          play_id: 2,
          play_type: 'trackplay',
          host: { id: 1, name: 'DJ Test' },
          show: { id: 1, name: 'Morning Show' }
        }
      ];

      const doublePlays = await detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].artist).toBe('Test Artist');
      expect(doublePlays[0].title).toBe('Test Song');
      expect(doublePlays[0].plays).toHaveLength(2);
      expect(doublePlays[0].dj).toBe('DJ Test');
      expect(doublePlays[0].show).toBe('Morning Show');
    });

    it('should detect double play with air break in between', async () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T10:08:00Z',
          artist: 'Test Artist',
          song: 'Test Song',
          play_id: 1,
          play_type: 'trackplay'
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
          play_type: 'trackplay'
        }
      ];

      const doublePlays = await detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].plays).toHaveLength(2);
      expect(doublePlays[0].plays[0].play_id).toBe(1);
      expect(doublePlays[0].plays[1].play_id).toBe(3);
    });

    it('should detect triple play', async () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T10:00:00Z',
          artist: 'Band',
          song: 'Hit',
          play_id: 1,
          play_type: 'trackplay'
        },
        {
          airdate: '2025-04-10T10:04:00Z',
          artist: 'Band',
          song: 'Hit',
          play_id: 2,
          play_type: 'trackplay'
        },
        {
          airdate: '2025-04-10T10:08:00Z',
          artist: 'Band',
          song: 'Hit',
          play_id: 3,
          play_type: 'trackplay'
        }
      ];

      const doublePlays = await detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].plays).toHaveLength(3);
    });

    it('should not detect double play when different songs', async () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T10:00:00Z',
          artist: 'Band',
          song: 'Song 1',
          play_id: 1,
          play_type: 'trackplay'
        },
        {
          airdate: '2025-04-10T10:04:00Z',
          artist: 'Band',
          song: 'Song 2',
          play_id: 2,
          play_type: 'trackplay'
        }
      ];

      const doublePlays = await detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(0);
    });

    it('should handle case-insensitive matching', async () => {
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-04-10T10:00:00Z',
          artist: 'The Band',
          song: 'Great Song',
          play_id: 1,
          play_type: 'trackplay'
        },
        {
          airdate: '2025-04-10T10:04:00Z',
          artist: 'THE BAND',
          song: 'GREAT SONG',
          play_id: 2,
          play_type: 'trackplay'
        }
      ];

      const doublePlays = await detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].plays).toHaveLength(2);
    });
  });

  describe('mergeDoublePlays', () => {
    it('should merge overlapping double plays', async () => {
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

    it('should not merge non-overlapping double plays', async () => {
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

    it('should add DJ and show info when missing', async () => {
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

  describe('classification', () => {
    it('should classify Spike Island as legitimate using real KEXP data', async () => {
      // Use real KEXP API to fetch the Spike Island double play
      const { KEXPApi } = await import('./api');
      const moment = (await import('moment')).default;
      const api = new KEXPApi();
      const detectorWithApi = new DoublePlayDetector(api);
      
      // Fetch real data for the Spike Island double play on April 10, 2025
      // Use the correct time window from the integration test (8:00-8:20 AM Pacific)
      const startTime = moment('2025-04-10T08:00:00-07:00');
      const endTime = moment('2025-04-10T08:20:00-07:00');
      
      const plays = await api.getAllPlays(startTime, endTime);
      
      // Filter to just the Spike Island plays
      const spikeIslandPlays = plays.filter(p => 
        p.artist === 'Pulp' && 
        p.song === 'Spike Island' &&
        p.play_type === 'trackplay'
      );
      
      expect(spikeIslandPlays).toHaveLength(2);
      expect(spikeIslandPlays[0].play_id).toBe(3487084);
      expect(spikeIslandPlays[1].play_id).toBe(3487086);
      
      // Detect double plays with the real data
      const doublePlays = await detectorWithApi.detectDoublePlays(plays);
      
      // Find the Spike Island double play
      const spikeIsland = doublePlays.find(dp => 
        dp.artist === 'Pulp' && dp.title === 'Spike Island'
      );
      
      expect(spikeIsland).toBeDefined();
      expect(spikeIsland!.classification).toBe('legitimate');
      
      // Verify the durations are what we expect (~20% difference but still legitimate)
      const firstDuration = spikeIsland!.plays[0].duration;
      const secondDuration = spikeIsland!.plays[1].duration;
      
      // These should be around 304 and 242 seconds respectively
      expect(firstDuration).toBeGreaterThan(290);
      expect(firstDuration).toBeLessThan(320);
      expect(secondDuration).toBeGreaterThan(230);
      expect(secondDuration).toBeLessThan(260);
      
      // Calculate the percentage difference to verify our logic
      if (firstDuration && secondDuration) {
        const maxDuration = Math.max(firstDuration, secondDuration);
        const minDuration = Math.min(firstDuration, secondDuration);
        const percentDifference = ((maxDuration - minDuration) / maxDuration) * 100;
        
        // Should be around 20% difference
        expect(percentDifference).toBeGreaterThan(15);
        expect(percentDifference).toBeLessThan(25);
        
        // But still classified as legitimate due to our new threshold
        expect(spikeIsland!.classification).toBe('legitimate');
      }
    }, 30000); // Increase timeout for API call

    it('should classify very short plays as mistakes', async () => {
      const playsWithDurations = [
        {
          timestamp: '2025-07-08T09:33:17-07:00',
          play_id: 1,
          duration: 319,
          kexpPlay: { play_type: 'trackplay' }
        },
        {
          timestamp: '2025-07-08T09:38:36-07:00',
          play_id: 2,
          duration: 15, // Very short - likely a mistake
          kexpPlay: { play_type: 'trackplay' }
        }
      ];

      const classification = (detector as any).calculateClassification(playsWithDurations);
      expect(classification).toBe('mistake');
    });

    it('should classify large duration differences as partial', async () => {
      const playsWithDurations = [
        {
          timestamp: '2025-07-08T09:00:00-07:00',
          play_id: 1,
          duration: 187,
          kexpPlay: { play_type: 'trackplay' }
        },
        {
          timestamp: '2025-07-08T09:05:00-07:00',
          play_id: 2,
          duration: 930, // Very different duration - likely partial play that was restarted
          kexpPlay: { play_type: 'trackplay' }
        }
      ];

      const classification = (detector as any).calculateClassification(playsWithDurations);
      expect(classification).toBe('partial');
    });

    it('should classify reasonable duration differences as legitimate', async () => {
      const playsWithDurations = [
        {
          timestamp: '2025-07-08T09:00:00-07:00',
          play_id: 1,
          duration: 165,
          kexpPlay: { play_type: 'trackplay' }
        },
        {
          timestamp: '2025-07-08T09:05:00-07:00',
          play_id: 2,
          duration: 196, // ~19% difference, should be legitimate
          kexpPlay: { play_type: 'trackplay' }
        }
      ];

      const classification = (detector as any).calculateClassification(playsWithDurations);
      expect(classification).toBe('legitimate');
    });

    it('should detect World News double play from September 23, 2025 with real KEXP data', async () => {
      // Real KEXP API data from September 23, 2025 7:26-7:31 AM Pacific
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-09-23T07:26:19-07:00',
          artist: 'World News',
          song: 'Everything is Coming Up Roses',
          album: 'Everything is Coming Up Roses',
          play_id: 3556644,
          play_type: 'trackplay'
        },
        {
          airdate: '2025-09-23T07:29:55-07:00',
          artist: '',
          song: '',
          play_id: 3556645,
          play_type: 'airbreak'
        },
        {
          airdate: '2025-09-23T07:31:05-07:00',
          artist: 'World News',
          song: 'Everything is Coming Up Roses',
          album: 'Everything is Coming Up Roses',
          play_id: 3556646,
          play_type: 'trackplay'
        }
      ];

      const doublePlays = await detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].artist).toBe('World News');
      expect(doublePlays[0].title).toBe('Everything is Coming Up Roses');
      expect(doublePlays[0].plays).toHaveLength(2);
      expect(doublePlays[0].plays[0].play_id).toBe(3556644);
      expect(doublePlays[0].plays[1].play_id).toBe(3556646);
    });

    it('should detect World News double play with missing album info', async () => {
      // Test case: KEXP API returns null/undefined album info but should still detect double play
      const plays: KEXPPlay[] = [
        {
          airdate: '2025-09-23T07:26:19-07:00',
          artist: 'World News',
          song: 'Everything is Coming Up Roses',
          album: undefined, // Missing album info
          play_id: 3556644,
          play_type: 'trackplay'
        },
        {
          airdate: '2025-09-23T07:29:55-07:00',
          artist: '',
          song: '',
          play_id: 3556645,
          play_type: 'airbreak'
        },
        {
          airdate: '2025-09-23T07:31:05-07:00',
          artist: 'World News',
          song: 'Everything is Coming Up Roses',
          album: null, // Missing album info (null)
          play_id: 3556646,
          play_type: 'trackplay'
        }
      ];

      const doublePlays = await detector.detectDoublePlays(plays);

      expect(doublePlays).toHaveLength(1);
      expect(doublePlays[0].artist).toBe('World News');
      expect(doublePlays[0].title).toBe('Everything is Coming Up Roses');
      expect(doublePlays[0].plays).toHaveLength(2);
    });
  });
});