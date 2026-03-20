import { test, expect, describe, beforeEach } from 'bun:test';
import { YouTubeManager } from './youtube-manager';
import { DoublePlay } from '@kexp-doubleplay/types';

const makeDoublePlay = (artist: string, title: string, album: string | null = null): DoublePlay => ({
  artist,
  title,
  plays: [{
    timestamp: '2025-04-10T15:08:00Z',
    play_id: 1,
    kexpPlay: {
      airdate: '2025-04-10T15:08:00Z',
      artist,
      song: title,
      album,
      play_id: 1,
      play_type: 'trackplay'
    }
  }, {
    timestamp: '2025-04-10T15:12:00Z',
    play_id: 2,
    kexpPlay: {
      airdate: '2025-04-10T15:12:00Z',
      artist,
      song: title,
      album,
      play_id: 2,
      play_type: 'trackplay'
    }
  }]
});

const youtubeData = {
  'test_artist__test_song__test_album': { artist: 'Test Artist', title: 'Test Song', album: 'Test Album', youtube_id: 'abc123' },
  'pulp__spike_island__no_album': { artist: 'Pulp', title: 'Spike Island', album: null, youtube_id: 'xyz789' }
};

describe('YouTubeManager', () => {
  beforeEach(() => {
    delete process.env.GITHUB_BACKUP_ENABLED;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPO_OWNER;
    delete process.env.GITHUB_REPO_NAME;
  });

  describe('getYouTubeId', () => {
    test('returns correct ID for known artist+title key', () => {
      const manager = new YouTubeManager();
      (manager as any).isEnabled = true;
      (manager as any).youtubeData = youtubeData;

      const doublePlay = makeDoublePlay('Test Artist', 'Test Song', 'Test Album');
      expect(manager.getYouTubeId(doublePlay)).toBe('abc123');
    });

    test('returns correct ID when album is null (uses no_album key)', () => {
      const manager = new YouTubeManager();
      (manager as any).isEnabled = true;
      (manager as any).youtubeData = youtubeData;

      const doublePlay = makeDoublePlay('Pulp', 'Spike Island');
      expect(manager.getYouTubeId(doublePlay)).toBe('xyz789');
    });

    test('returns undefined when no match', () => {
      const manager = new YouTubeManager();
      (manager as any).isEnabled = true;
      (manager as any).youtubeData = youtubeData;

      const doublePlay = makeDoublePlay('Unknown Artist', 'Unknown Song');
      expect(manager.getYouTubeId(doublePlay)).toBeUndefined();
    });
  });

  describe('enrichWithYouTubeIds', () => {
    test('adds youtube_id to matching double plays and leaves non-matching unchanged', () => {
      const manager = new YouTubeManager();
      (manager as any).isEnabled = true;
      (manager as any).youtubeData = youtubeData;

      const doublePlays = [
        makeDoublePlay('Test Artist', 'Test Song', 'Test Album'),
        makeDoublePlay('Unknown Artist', 'Unknown Song'),
        makeDoublePlay('Pulp', 'Spike Island')
      ];

      const enriched = manager.enrichWithYouTubeIds(doublePlays);

      expect(enriched).toHaveLength(3);
      expect(enriched[0].youtube_id).toBe('abc123');
      expect(enriched[1].youtube_id).toBeUndefined();
      expect(enriched[2].youtube_id).toBe('xyz789');
    });

    test('returns original array when disabled', () => {
      const manager = new YouTubeManager();
      // Manager is disabled by default (no env vars set)
      (manager as any).youtubeData = youtubeData;

      const doublePlays = [
        makeDoublePlay('Test Artist', 'Test Song', 'Test Album')
      ];

      const result = manager.enrichWithYouTubeIds(doublePlays);

      expect(result).toBe(doublePlays);
      expect(result[0].youtube_id).toBeUndefined();
    });
  });

  describe('getStatus', () => {
    test('reports correct enabled state when disabled', () => {
      const manager = new YouTubeManager();
      const status = manager.getStatus();

      expect(status.enabled).toBe(false);
    });

    test('reports correct enabled state when enabled', () => {
      const manager = new YouTubeManager();
      (manager as any).isEnabled = true;
      const status = manager.getStatus();

      expect(status.enabled).toBe(true);
    });

    test('reports stale when lastUpdate is null (never updated)', () => {
      const manager = new YouTubeManager();
      const status = manager.getStatus();

      expect(status.lastUpdate).toBeNull();
      expect(status.isStale).toBe(true);
    });

    test('reports stale when lastUpdate is more than 30 minutes ago', () => {
      const manager = new YouTubeManager();
      const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
      (manager as any).lastUpdate = thirtyOneMinutesAgo;

      const status = manager.getStatus();

      expect(status.isStale).toBe(true);
      expect(status.lastUpdate).toBe(thirtyOneMinutesAgo.toISOString());
    });

    test('reports not stale when lastUpdate is less than 30 minutes ago', () => {
      const manager = new YouTubeManager();
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      (manager as any).lastUpdate = fiveMinutesAgo;

      const status = manager.getStatus();

      expect(status.isStale).toBe(false);
      expect(status.lastUpdate).toBe(fiveMinutesAgo.toISOString());
    });
  });
});
