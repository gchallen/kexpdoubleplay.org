import fetch from 'node-fetch';
import moment from 'moment';
import { KEXPPlay } from './types';
import { config } from './config';

export class KEXPApi {
  private lastRequestTime = 0;

  private async rateLimitedFetch(url: string): Promise<any> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < config.rateLimitDelay) {
      await this.sleep(config.rateLimitDelay - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
                id: result.show.id,
                name: result.show.name
              } : undefined,
              host: result.host ? {
                id: result.host.id,
                name: result.host.name
              } : undefined
            });
          }
        }
      }
      
      // Check for next page, but avoid infinite loops
      const currentUrl = nextUrl;
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
}