import fetch from 'node-fetch';
import * as http from 'http';
import * as https from 'https';
import moment from 'moment';
import { KEXPPlay } from '@kexp-doubleplay/types';
import { config } from './config';
import logger from './logger';

export class KEXPApi {
  private lastRequestTime = 0;
  private showCache = new Map<number, any>();
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private isHealthy = true;

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
    // Check if we need to apply exponential backoff
    if (this.consecutiveFailures > 0 && this.lastFailureTime) {
      const backoffDelay = this.calculateBackoffDelay();
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceFailure < backoffDelay) {
        const waitTime = backoffDelay - timeSinceFailure;
        logger.warn('API backoff in effect', {
          waitTimeSeconds: Math.round(waitTime / 1000),
          consecutiveFailures: this.consecutiveFailures,
          backoffDelayMs: backoffDelay
        });
        await this.sleep(waitTime);
      }
    }
    
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Log the configured delay and actual wait time
    logger.debug('Rate limiting check', {
      configuredDelayMs: config.rateLimitDelay,
      timeSinceLastRequestMs: timeSinceLastRequest,
      willWaitMs: Math.max(0, config.rateLimitDelay - timeSinceLastRequest)
    });
    
    if (timeSinceLastRequest < config.rateLimitDelay) {
      const waitTime = config.rateLimitDelay - timeSinceLastRequest;
      logger.debug('Applying rate limit delay', {
        waitTimeMs: waitTime,
        reason: 'Rate limit enforcement'
      });
      await this.sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
    
    // Determine which agent to use based on URL protocol
    const agent = url.startsWith('https:') ? this.httpsAgent : this.httpAgent;
    
    // Log the actual request being made
    logger.debug('Making API request', {
      url: url,
      timeout: 30000,
      method: 'GET'
    });
    
    const requestStartTime = Date.now();
    
    try {
      // Create controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url, {
        agent: agent,
        signal: controller.signal,
        headers: {
          'User-Agent': 'KEXP-DoublePlay-Scanner/1.0',
          'Accept': 'application/json',
          'Connection': 'keep-alive'
        }
      });
      
      // Clear timeout since request succeeded
      clearTimeout(timeoutId);
      
      // Increment total request counter
      this.totalRequests++;
      
      const requestDuration = Date.now() - requestStartTime;
      logger.debug('API request completed', {
        url: url,
        statusCode: response.status,
        durationMs: requestDuration,
        ok: response.ok
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      // Reset failure count on successful request
      this.consecutiveFailures = 0;
      this.lastFailureTime = null;
      this.isHealthy = true;
      
      return response.json();
    } catch (error) {
      // Record the failure
      this.consecutiveFailures++;
      this.lastFailureTime = Date.now();
      this.isHealthy = false;
      
      // Don't log here - let the scan-queue handle logging with retry counts
      // Only log at debug level for troubleshooting
      logger.debug('API request failed, will be retried', {
        consecutiveFailures: this.consecutiveFailures,
        nextRetryDelay: this.calculateBackoffDelay() / 1000,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
      
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateBackoffDelay(): number {
    // Exponential backoff: min 5s, max 5 minutes
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 300000; // 5 minutes
    const exponentialDelay = baseDelay * Math.pow(2, Math.min(this.consecutiveFailures - 1, 6));
    return Math.min(exponentialDelay, maxDelay);
  }

  private totalRequests = 0;

  getHealthStatus(): { isHealthy: boolean; consecutiveFailures: number; lastFailureTime: number | null } {
    return {
      isHealthy: this.isHealthy,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime
    };
  }

  getTotalRequests(): number {
    return this.totalRequests;
  }

  resetRequestCount(): void {
    this.totalRequests = 0;
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

  async getAllPlays(startTime: moment.Moment, endTime: moment.Moment): Promise<KEXPPlay[]> {
    const plays: KEXPPlay[] = [];
    let nextUrl: string | null = this.buildPlaylistUrl(startTime, endTime);
    let requestCount = 0;
    
    while (nextUrl) {
      requestCount++;
      logger.debug('Fetching KEXP API page', {
        url: nextUrl.substring(0, 150) + (nextUrl.length > 150 ? '...' : ''),
        requestCount
      });
      const data = await this.rateLimitedFetch(nextUrl);
      
      if (data.results) {
        for (const result of data.results) {
          // Include ALL play types, not just trackplay
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
      
      // Check for next page, but avoid infinite loops
      const currentUrl: string = nextUrl;
      nextUrl = data.next || null;
      
      // If we get the same URL back, break to avoid infinite loop
      if (nextUrl === currentUrl) {
        logger.debug('Breaking API pagination due to identical next URL');
        break;
      }
      
      // If no more results and we have a next URL, it might be empty pages
      if (!data.results || data.results.length === 0) {
        logger.debug('Breaking API pagination due to empty results');
        break;
      }
      
      // Safety check: limit to reasonable number of pages
      if (requestCount > 1000) {
        logger.warn('Breaking API pagination after 1000 requests to prevent infinite loop');
        break;
      }
    }
    
    logger.info('Fetched playlist data', {
      totalItems: plays.length,
      requestCount,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    });
    
    return plays;
  }

  async getPlays(startTime: moment.Moment, endTime: moment.Moment): Promise<KEXPPlay[]> {
    const allPlays = await this.getAllPlays(startTime, endTime);
    // Filter to only trackplay for backward compatibility
    return allPlays.filter(play => play.play_type === 'trackplay');
  }

  private async getPlaysInternal(startTime: moment.Moment, endTime: moment.Moment): Promise<KEXPPlay[]> {
    const plays: KEXPPlay[] = [];
    let nextUrl: string | null = this.buildPlaylistUrl(startTime, endTime);
    let requestCount = 0;
    
    while (nextUrl) {
      requestCount++;
      logger.debug('Fetching KEXP API page', {
        url: nextUrl.substring(0, 150) + (nextUrl.length > 150 ? '...' : ''),
        requestCount
      });
      const data = await this.rateLimitedFetch(nextUrl);
      
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
        logger.debug('Breaking API pagination due to identical next URL');
        break;
      }
      
      // If no more results and we have a next URL, it might be empty pages
      if (!data.results || data.results.length === 0) {
        logger.debug('Breaking API pagination due to empty results');
        break;
      }
    }
    
    logger.debug('Completed API pagination', {
      totalRequests: requestCount,
      finalPlayCount: plays.length,
      timeRange: `${startTime.format('YYYY-MM-DD HH:mm')} → ${endTime.format('YYYY-MM-DD HH:mm')}`
    });
    
    return plays;
  }

  private buildPlaylistUrl(startTime: moment.Moment, endTime: moment.Moment): string {
    const start = startTime.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z';
    const end = endTime.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z';
    
    // Properly encode the URL parameters to prevent issues
    const encodedStart = encodeURIComponent(start);
    const encodedEnd = encodeURIComponent(end);
    
    const url = `${config.apiBaseUrl}/plays/?airdate_after=${encodedStart}&airdate_before=${encodedEnd}&ordering=airdate`;
    
    // Validate URL is properly formed
    logger.debug('Built playlist URL', {
      startTime: start,
      endTime: end,
      url: url.substring(0, 150) + (url.length > 150 ? '...' : '')
    });
    
    return url;
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
      logger.debug('Failed to fetch show info', {
        showId: play.show.id,
        error: error instanceof Error ? error.message : error
      });
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
    logger.debug('KEXP API client destroyed and connections closed');
  }
}