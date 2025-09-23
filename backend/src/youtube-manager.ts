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
    const albumPart = album ? album.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'no_album';
    const artistPart = artist.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const titlePart = title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    
    return `${artistPart}__${titlePart}__${albumPart}`;
  }

  /**
   * Download YouTube.yml file from GitHub
   */
  private async downloadYouTubeData(): Promise<YouTubeData> {
    if (!this.isEnabled || !this.githubToken || !this.githubOwner || !this.githubRepo) {
      return {};
    }

    try {
      const apiUrl = `https://api.github.com/repos/${this.githubOwner}/${this.githubRepo}/contents/${this.YOUTUBE_FILE}`;
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'User-Agent': 'KEXP-DoublePlay-Scanner/1.0'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          logger.info('YouTube.yml file not found in repository, YouTube data will be empty');
          return {};
        }
        throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
      }

      const fileData = await response.json() as { content: string; encoding: string };
      const decodedContent = Buffer.from(fileData.content, 'base64').toString('utf8');
      const data = YAML.parse(decodedContent) || {};
      
      logger.info('YouTube data updated from GitHub', {
        entriesCount: Object.keys(data).length,
        file: this.YOUTUBE_FILE
      });

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
      this.youtubeData = await this.downloadYouTubeData();
      this.lastUpdate = new Date();
      
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