import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test, expect, describe, beforeAll, afterAll, mock } from 'bun:test';
import {
  HealthResponseSchema,
  DoublePlaysResponseSchema,
  PaginatedResponseSchema,
  StatsResponseSchema,
  ApiInfoResponseSchema,
  ErrorResponseSchema,
  type DoublePlayData
} from '@kexp-doubleplay/types';

// Create temp directory and data file
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-server-test-'));
const tmpFile = path.join(tmpDir, 'test-data.json');

// Mock the config module so ApiServer's Storage uses our temp file
mock.module('./config', () => ({
  config: {
    dataFilePath: tmpFile,
    apiBaseUrl: 'https://api.kexp.org/v2',
    rateLimitDelay: 1000,
    scanIntervalMinutes: 5,
    maxHoursPerRequest: 1,
    apiPort: 3000,
  }
}));

const TEST_PORT = 19876;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Fixture data: 3 double plays (2 by same artist for stats aggregation, 1 with DJ/show)
const fixtureData: DoublePlayData = {
  startTime: '2025-04-01T00:00:00.000Z',
  endTime: '2025-04-30T23:59:59.999Z',
  counts: {
    legitimate: 2,
    partial: 1,
    mistake: 0
  },
  doublePlays: [
    {
      artist: 'Radiohead',
      title: 'Everything In Its Right Place',
      classification: 'legitimate',
      plays: [
        {
          timestamp: '2025-04-10T15:00:00.000Z',
          play_id: 1001,
          kexpPlay: {
            airdate: '2025-04-10T15:00:00.000Z',
            artist: 'Radiohead',
            song: 'Everything In Its Right Place',
            album: 'Kid A',
            play_id: 1001,
            play_type: 'trackplay',
            show: { id: 10, name: 'Morning Show' },
            host: { id: 20, name: 'DJ Shadow' }
          }
        },
        {
          timestamp: '2025-04-10T15:05:00.000Z',
          play_id: 1002,
          kexpPlay: {
            airdate: '2025-04-10T15:05:00.000Z',
            artist: 'Radiohead',
            song: 'Everything In Its Right Place',
            album: 'Kid A',
            play_id: 1002,
            play_type: 'trackplay',
            show: { id: 10, name: 'Morning Show' },
            host: { id: 20, name: 'DJ Shadow' }
          }
        }
      ],
      dj: 'DJ Shadow',
      show: 'Morning Show'
    },
    {
      artist: 'Radiohead',
      title: 'Idioteque',
      classification: 'legitimate',
      plays: [
        {
          timestamp: '2025-04-15T20:00:00.000Z',
          play_id: 2001,
          kexpPlay: {
            airdate: '2025-04-15T20:00:00.000Z',
            artist: 'Radiohead',
            song: 'Idioteque',
            album: 'Kid A',
            play_id: 2001,
            play_type: 'trackplay',
            show: { id: 11, name: 'Evening Show' },
            host: { id: 21, name: 'DJ Kicks' }
          }
        },
        {
          timestamp: '2025-04-15T20:04:00.000Z',
          play_id: 2002,
          kexpPlay: {
            airdate: '2025-04-15T20:04:00.000Z',
            artist: 'Radiohead',
            song: 'Idioteque',
            album: 'Kid A',
            play_id: 2002,
            play_type: 'trackplay',
            show: { id: 11, name: 'Evening Show' },
            host: { id: 21, name: 'DJ Kicks' }
          }
        }
      ],
      dj: 'DJ Kicks',
      show: 'Evening Show'
    },
    {
      artist: 'Pulp',
      title: 'Spike Island',
      classification: 'partial',
      plays: [
        {
          timestamp: '2025-04-20T12:00:00.000Z',
          play_id: 3001,
          kexpPlay: {
            airdate: '2025-04-20T12:00:00.000Z',
            artist: 'Pulp',
            song: 'Spike Island',
            album: null,
            play_id: 3001,
            play_type: 'trackplay'
          }
        },
        {
          timestamp: '2025-04-20T12:04:00.000Z',
          play_id: 3002,
          kexpPlay: {
            airdate: '2025-04-20T12:04:00.000Z',
            artist: 'Pulp',
            song: 'Spike Island',
            album: null,
            play_id: 3002,
            play_type: 'trackplay'
          }
        }
      ]
    }
  ]
};

import { ApiServer } from './api-server';

let apiServer: ApiServer;

beforeAll(async () => {
  // Write fixture data to temp file
  fs.writeFileSync(tmpFile, JSON.stringify(fixtureData, null, 2), 'utf-8');

  // Create and start the API server (no KEXPApi, no ScanQueue, no YouTubeManager)
  apiServer = new ApiServer(TEST_PORT);
  apiServer.updateScannerStatus('running');
  await apiServer.start();
});

afterAll(() => {
  if (apiServer) {
    apiServer.stop();
  }
  // Clean up temp files
  try {
    fs.unlinkSync(tmpFile);
    fs.rmdirSync(tmpDir);
  } catch {
    // Ignore cleanup errors
  }
});

describe('ApiServer endpoints', () => {
  describe('GET /api/health', () => {
    test('returns 200 and matches HealthResponseSchema', async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = HealthResponseSchema.parse(body);

      expect(parsed.status).toBe('running');
      expect(parsed.scanner.totalDoublePlays).toBe(3);
      expect(parsed.scanner.dataFileExists).toBe(true);
      expect(parsed.scanner.earliestScanDate).toBe(fixtureData.startTime);
      expect(parsed.scanner.latestScanDate).toBe(fixtureData.endTime);
      expect(parsed.kexpApi.isHealthy).toBe(true);
      expect(parsed.kexpApi.consecutiveFailures).toBe(0);
      expect(typeof parsed.uptime).toBe('number');
      expect(typeof parsed.system.cpuCount).toBe('number');
    });
  });

  describe('GET /api/double-plays', () => {
    test('returns valid DoublePlaysResponseSchema with correct totalCount', async () => {
      const res = await fetch(`${BASE_URL}/api/double-plays`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = DoublePlaysResponseSchema.parse(body);

      expect(parsed.totalCount).toBe(3);
      expect(parsed.doublePlays).toHaveLength(3);
      expect(parsed.startTime).toBe(fixtureData.startTime);
      expect(parsed.endTime).toBe(fixtureData.endTime);
      expect(parsed.counts.legitimate).toBe(2);
      expect(parsed.counts.partial).toBe(1);
      expect(parsed.counts.mistake).toBe(0);
      expect(parsed.retrievalStatus).toBe('running');
      expect(parsed.metadata.kexpApiHealth.isHealthy).toBe(true);
    });
  });

  describe('GET /api/double-plays/paginated', () => {
    test('default pagination returns all items when count <= default limit', async () => {
      const res = await fetch(`${BASE_URL}/api/double-plays/paginated`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = PaginatedResponseSchema.parse(body);

      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(10);
      expect(parsed.totalCount).toBe(3);
      expect(parsed.totalPages).toBe(1);
      expect(parsed.hasNext).toBe(false);
      expect(parsed.hasPrevious).toBe(false);
      expect(parsed.doublePlays).toHaveLength(3);
    });

    test('page and limit params control pagination', async () => {
      const res = await fetch(`${BASE_URL}/api/double-plays/paginated?page=1&limit=2`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = PaginatedResponseSchema.parse(body);

      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(2);
      expect(parsed.totalCount).toBe(3);
      expect(parsed.totalPages).toBe(2);
      expect(parsed.hasNext).toBe(true);
      expect(parsed.hasPrevious).toBe(false);
      expect(parsed.doublePlays).toHaveLength(2);
    });

    test('second page returns remaining items', async () => {
      const res = await fetch(`${BASE_URL}/api/double-plays/paginated?page=2&limit=2`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = PaginatedResponseSchema.parse(body);

      expect(parsed.page).toBe(2);
      expect(parsed.totalCount).toBe(3);
      expect(parsed.totalPages).toBe(2);
      expect(parsed.hasNext).toBe(false);
      expect(parsed.hasPrevious).toBe(true);
      expect(parsed.doublePlays).toHaveLength(1);
    });

    test('page=0 returns 400 error', async () => {
      const res = await fetch(`${BASE_URL}/api/double-plays/paginated?page=0`);
      expect(res.status).toBe(400);

      const body = await res.json();
      const parsed = ErrorResponseSchema.parse(body);

      expect(parsed.error).toBe('Invalid query parameters');
    });
  });

  describe('GET /api/stats', () => {
    test('returns valid StatsResponseSchema with correct aggregation', async () => {
      const res = await fetch(`${BASE_URL}/api/stats`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = StatsResponseSchema.parse(body);

      expect(parsed.summary.totalDoublePlays).toBe(3);
      expect(parsed.summary.uniqueArtists).toBe(2); // Radiohead and Pulp
      expect(parsed.summary.uniqueDJs).toBe(2); // DJ Shadow and DJ Kicks
      expect(parsed.summary.uniqueShows).toBe(2); // Morning Show and Evening Show
      expect(parsed.summary.timespan.start).toBe(fixtureData.startTime);
      expect(parsed.summary.timespan.end).toBe(fixtureData.endTime);

      // Radiohead has 2 double plays, should be top artist
      expect(parsed.topArtists[0].artist).toBe('Radiohead');
      expect(parsed.topArtists[0].count).toBe(2);
      expect(parsed.topArtists[1].artist).toBe('Pulp');
      expect(parsed.topArtists[1].count).toBe(1);

      // Play count distribution: all 3 double plays have 2 plays each
      expect(parsed.playCountDistribution['2']).toBe(3);
    });
  });

  describe('GET /api', () => {
    test('returns valid ApiInfoResponseSchema', async () => {
      const res = await fetch(`${BASE_URL}/api`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = ApiInfoResponseSchema.parse(body);

      expect(parsed.name).toBe('KEXP Double Play Scanner API');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.endpoints).toBeDefined();
      expect(parsed.endpoints['/api/health']).toBeDefined();
      expect(parsed.endpoints['/api/double-plays']).toBeDefined();
      expect(parsed.endpoints['/api/double-plays/paginated']).toBeDefined();
      expect(parsed.endpoints['/api/stats']).toBeDefined();
    });
  });

  describe('404 handler', () => {
    test('returns 404 with ErrorResponseSchema for unknown endpoint', async () => {
      const res = await fetch(`${BASE_URL}/api/nonexistent`);
      expect(res.status).toBe(404);

      const body = await res.json();
      const parsed = ErrorResponseSchema.parse(body);

      expect(parsed.error).toBe('Endpoint not found');
      expect(parsed.availableEndpoints).toBeDefined();
      expect(parsed.availableEndpoints).toContain('/api/health');
      expect(parsed.availableEndpoints).toContain('/api/double-plays');
    });
  });
});
