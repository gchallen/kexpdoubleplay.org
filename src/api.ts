import fetch from 'node-fetch';
import * as http from 'http';
import * as https from 'https';
import moment from 'moment';
import { KEXPPlay } from './types';
import { config } from './config';

export class KEXPApi {
  private lastRequestTime = 0;
  private showCache = new Map<number, any>();
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;

  constructor() {
    // Create HTTP agents with connection pooling and keep-alive
    this.httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000, // Keep connections alive for 30 seconds
      maxSockets: 10, // Max concurrent connections per host
      maxFreeSockets: 5, // Max idle connections per host
      timeout: 60000, // Socket timeout
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 60000,
    });
  }

  private async rateLimitedFetch(url: string): Promise<any> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < config.rateLimitDelay) {
      await this.sleep(config.rateLimitDelay - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
    
    // Determine which agent to use based on URL protocol
    const agent = url.startsWith('https:') ? this.httpsAgent : this.httpAgent;
    
    const response = await fetch(url, {
      agent: agent,
      timeout: 30000, // 30 second request timeout
      headers: {
        'User-Agent': 'KEXP-DoublePlay-Scanner/1.0',
        'Accept': 'application/json',
        'Connection': 'keep-alive'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getShowInfo(showId: number): Promise<any> {
    if (this.showCache.has(showId)) {
      return this.showCache.get(showId);
    }
    
    const showUrl = `${config.apiBaseUrl}/shows/${showId}/`;
    const showData = await this.rateLimitedFetch(showUrl);
    this.showCache.set(showId, showData);
    return showData;
  }

  async getPlays(startTime: moment.Moment, endTime: moment.Moment): Promise<KEXPPlay[]> {
    const plays: KEXPPlay[] = [];
    let nextUrl: string | null = this.buildPlaylistUrl(startTime, endTime);
    let requestCount = 0;
    const maxRequests = 50; // Prevent infinite loops
    
    while (nextUrl && requestCount < maxRequests) {
      console.log(`Fetching: ${nextUrl}`);
      const data = await this.rateLimitedFetch(nextUrl);
      requestCount++;
      
      if (data.results) {
        for (const result of data.results) {
          if (result.play_type === 'trackplay') {
            plays.push({
              airdate: result.airdate,
              artist: result.artist || '',
              song: result.song || '',
              album: result.album,
              play_id: result.id,
              play_type: result.play_type,
              image_uri: result.image_uri,
              thumbnail_uri: result.thumbnail_uri,
              show: result.show ? {
                id: result.show,
                name: 'Unknown Show' // Will be filled in later if needed
              } : undefined,
              host: undefined // Will be filled in later if needed
            });
          }
        }
      }
      
      // Check for next page, but avoid infinite loops
      const currentUrl: string = nextUrl;
      nextUrl = data.next || null;
      
      // If we get the same URL back, break to avoid infinite loop
      if (nextUrl === currentUrl) {
        console.log('Breaking due to identical next URL');
        break;
      }
      
      // If no more results and we have a next URL, it might be empty pages
      if (!data.results || data.results.length === 0) {
        console.log('Breaking due to empty results');
        break;
      }
    }
    
    if (requestCount >= maxRequests) {
      console.log(`Stopped fetching after ${maxRequests} requests to prevent infinite loop`);
    }
    
    return plays;
  }

  private buildPlaylistUrl(startTime: moment.Moment, endTime: moment.Moment): string {
    const start = startTime.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z';
    const end = endTime.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z';
    
    return `${config.apiBaseUrl}/plays/?airdate_after=${start}&airdate_before=${end}&ordering=airdate`;
  }

  async enrichPlayWithShowInfo(play: KEXPPlay): Promise<KEXPPlay> {
    if (!play.show?.id) {
      return play;
    }

    try {
      const showInfo = await this.getShowInfo(play.show.id);
      return {
        ...play,
        show: {
          id: play.show.id,
          name: showInfo.program_name || 'Unknown Show'
        },
        host: showInfo && showInfo.host_names && showInfo.host_names.length > 0 ? {
          id: showInfo.hosts?.[0] || 0,
          name: showInfo.host_names[0]
        } : undefined
      };
    } catch (error) {
      console.warn(`Failed to fetch show info for show ID ${play.show.id}:`, error);
      return play;
    }
  }

  /**
   * Cleanup method to properly close HTTP agents and their connections
   * Should be called when shutting down the application
   */
  destroy(): void {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    this.showCache.clear();
    console.log('KEXP API client destroyed and connections closed');
  }
}