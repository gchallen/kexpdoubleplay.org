import fetch from 'node-fetch';
import YAML from 'yaml';
import { DoublePlay } from '@kexp-doubleplay/types';
import logger from './logger';

interface YouTubeEntry {
  artist: string;
  title: string;
  album: string | null;
  youtube_id?: string;
  search_url?: string;
  duration?: number;
  durations?: number[];
}

interface YouTubeData {
  [key: string]: YouTubeEntry;
}

export class YouTubeManager {
  private isEnabled: boolean;
  private githubToken: string | null = null;
  private githubOwner: string | null = null;
  private githubRepo: string | null = null;
  private youtubeData: YouTubeData = {};
  private lastUpdate: Date | null = null;
  private previousEntryCount = 0;
  private lastETag: string | null = null;
  private readonly YOUTUBE_FILE = 'YouTube.yml';

  constructor() {
    // Use same GitHub configuration as BackupManager
    this.isEnabled = process.env.GITHUB_BACKUP_ENABLED === 'true';
    this.githubToken = process.env.GITHUB_TOKEN || null;
    this.githubOwner = process.env.GITHUB_REPO_OWNER || null;
    this.githubRepo = process.env.GITHUB_REPO_NAME || null;

    if (this.isEnabled && (!this.githubToken || !this.githubOwner || !this.githubRepo)) {
      logger.warn('YouTube integration disabled - missing GitHub configuration');
      this.isEnabled = false;
    }
  }

  /**
   * Create a track key from artist, title, and album (matches the format in YouTube.yml)
   */
  private createTrackKey(artist: string, title: string, album: string | null): string {
    const normalize = (str: string): string => {
      return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    };

    const artistPart = normalize(artist);
    const titlePart = normalize(title);
    const albumPart = album ? normalize(album) : 'no_album';

    return `${artistPart}__${titlePart}__${albumPart}`;
  }

  /**
   * Download YouTube.yml file from GitHub, using ETag for conditional requests
   * Returns null if content hasn't changed (304 Not Modified)
   */
  private async downloadYouTubeData(): Promise<YouTubeData | null> {
    if (!this.isEnabled || !this.githubToken || !this.githubOwner || !this.githubRepo) {
      return {};
    }

    try {
      const apiUrl = `https://api.github.com/repos/${this.githubOwner}/${this.githubRepo}/contents/${this.YOUTUBE_FILE}`;

      const headers: Record<string, string> = {
        'Authorization': `token ${this.githubToken}`,
        'User-Agent': 'KEXP-DoublePlay-Scanner/1.0'
      };

      if (this.lastETag) {
        headers['If-None-Match'] = this.lastETag;
      }

      const response = await fetch(apiUrl, { headers });

      // 304 Not Modified - content unchanged
      if (response.status === 304) {
        logger.debug('YouTube data unchanged (304 Not Modified)', {
          entriesCount: this.previousEntryCount,
          file: this.YOUTUBE_FILE
        });
        return null;
      }

      if (!response.ok) {
        if (response.status === 404) {
          logger.info('YouTube.yml file not found in repository, YouTube data will be empty');
          return {};
        }
        throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
      }

      // Store ETag for next request
      const etag = response.headers.get('etag');
      if (etag) {
        this.lastETag = etag;
      }

      const fileData = await response.json() as { content: string; encoding: string };
      const decodedContent = Buffer.from(fileData.content, 'base64').toString('utf8');
      const data = YAML.parse(decodedContent) || {};

      const newCount = Object.keys(data).length;
      if (newCount !== this.previousEntryCount) {
        logger.info('YouTube data updated from GitHub', {
          entriesCount: newCount,
          previousCount: this.previousEntryCount,
          file: this.YOUTUBE_FILE
        });
      } else {
        logger.debug('YouTube data refreshed from GitHub (unchanged)', {
          entriesCount: newCount,
          file: this.YOUTUBE_FILE
        });
      }
      this.previousEntryCount = newCount;

      return data;
    } catch (error) {
      logger.error('Failed to download YouTube data from GitHub', {
        error: error instanceof Error ? error.message : 'Unknown error',
        file: this.YOUTUBE_FILE
      });
      return {};
    }
  }

  /**
   * Update YouTube data from GitHub (call this periodically)
   */
  async updateYouTubeData(): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const data = await this.downloadYouTubeData();
      this.lastUpdate = new Date();

      // null means 304 Not Modified - keep existing data
      if (data !== null) {
        this.youtubeData = data;
      }

      logger.debug('YouTube data refresh completed', {
        entriesCount: Object.keys(this.youtubeData).length,
        lastUpdate: this.lastUpdate.toISOString()
      });
    } catch (error) {
      logger.error('YouTube data update failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get YouTube ID for a specific double play
   */
  getYouTubeId(doublePlay: DoublePlay): string | undefined {
    if (!this.isEnabled || Object.keys(this.youtubeData).length === 0) {
      return undefined;
    }

    const trackKey = this.createTrackKey(
      doublePlay.artist,
      doublePlay.title,
      doublePlay.plays[0]?.kexpPlay?.album || null
    );

    const youtubeEntry = this.youtubeData[trackKey];
    return youtubeEntry?.youtube_id || undefined;
  }

  /**
   * Enrich double play data with YouTube IDs
   */
  enrichWithYouTubeIds(doublePlays: DoublePlay[]): DoublePlay[] {
    if (!this.isEnabled || Object.keys(this.youtubeData).length === 0) {
      return doublePlays;
    }

    let enrichedCount = 0;
    const enrichedPlays = doublePlays.map(doublePlay => {
      const youtubeId = this.getYouTubeId(doublePlay);
      if (youtubeId && youtubeId.trim() !== '') {
        enrichedCount++;
        return {
          ...doublePlay,
          youtube_id: youtubeId
        };
      }
      return doublePlay;
    });

    if (enrichedCount > 0) {
      logger.debug('Enriched double plays with YouTube IDs', {
        totalPlays: doublePlays.length,
        enrichedPlays: enrichedCount
      });
    }

    return enrichedPlays;
  }

  /**
   * Get status information for health checks
   */
  getStatus(): {
    enabled: boolean;
    lastUpdate: string | null;
    entriesCount: number;
    isStale: boolean;
  } {
    const isStale = this.lastUpdate ? 
      (Date.now() - this.lastUpdate.getTime()) > (30 * 60 * 1000) : // 30 minutes
      true;

    return {
      enabled: this.isEnabled,
      lastUpdate: this.lastUpdate?.toISOString() || null,
      entriesCount: Object.keys(this.youtubeData).length,
      isStale
    };
  }
}