import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Storage } from './storage';
import { DoublePlayData, DoublePlay } from '@kexp-doubleplay/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const makePlay = (id: number, timestamp: string) => ({
  timestamp,
  play_id: id,
  kexpPlay: {
    airdate: timestamp,
    artist: 'Test Artist',
    song: 'Test Song',
    play_id: id,
    play_type: 'trackplay'
  }
});

const makeDoublePlay = (artist: string, title: string, timestamp: string, classification?: string): DoublePlay => ({
  artist,
  title,
  plays: [makePlay(1, timestamp), makePlay(2, timestamp)],
  ...(classification ? { classification: classification as 'legitimate' | 'partial' | 'mistake' } : {})
});

const makeData = (doublePlays: DoublePlay[] = []): DoublePlayData => ({
  startTime: '2025-01-01T00:00:00Z',
  endTime: '2025-01-02T00:00:00Z',
  doublePlays,
  counts: {
    legitimate: 0,
    partial: 0,
    mistake: 0
  }
});

describe('Storage', () => {
  describe('round-trip: save then load', () => {
    test('produces identical data', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      const storage = new Storage(filePath);

      const data = makeData([
        makeDoublePlay('Artist A', 'Song A', '2025-06-01T10:00:00Z', 'legitimate'),
        makeDoublePlay('Artist B', 'Song B', '2025-05-15T08:00:00Z', 'partial')
      ]);

      await storage.save(data);
      const loaded = await storage.load();

      expect(loaded.startTime).toBe(data.startTime);
      expect(loaded.endTime).toBe(data.endTime);
      expect(loaded.doublePlays).toHaveLength(2);
      expect(loaded.doublePlays[0].artist).toBe('Artist A');
      expect(loaded.doublePlays[1].artist).toBe('Artist B');
      expect(loaded.counts.legitimate).toBe(1);
      expect(loaded.counts.partial).toBe(1);
      expect(loaded.counts.mistake).toBe(0);
    });
  });

  describe('load()', () => {
    test('returns default data when file does not exist', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.json');
      const storage = new Storage(filePath);

      const data = await storage.load();

      expect(data.doublePlays).toEqual([]);
      expect(data.counts).toEqual({
        legitimate: 0,
        partial: 0,
        mistake: 0
      });
      expect(typeof data.startTime).toBe('string');
      expect(typeof data.endTime).toBe('string');
    });

    test('adds counts field when loading data without it (backward compat)', async () => {
      const filePath = path.join(tmpDir, 'legacy.json');

      // Write data in old format without counts
      const legacyData = {
        startTime: '2025-01-01T00:00:00Z',
        endTime: '2025-01-02T00:00:00Z',
        doublePlays: [
          makeDoublePlay('Artist A', 'Song A', '2025-06-01T10:00:00Z', 'legitimate'),
          makeDoublePlay('Artist B', 'Song B', '2025-05-15T08:00:00Z', 'partial'),
          makeDoublePlay('Artist C', 'Song C', '2025-04-01T12:00:00Z', 'mistake'),
          makeDoublePlay('Artist D', 'Song D', '2025-03-01T12:00:00Z') // no classification defaults to partial
        ]
      };

      fs.writeFileSync(filePath, JSON.stringify(legacyData, null, 2), 'utf-8');

      const storage = new Storage(filePath);
      const data = await storage.load();

      expect(data.counts).toBeDefined();
      expect(data.counts.legitimate).toBe(1);
      expect(data.counts.partial).toBe(2); // one explicit partial + one defaulted to partial
      expect(data.counts.mistake).toBe(1);
    });
  });

  describe('save()', () => {
    test('sorts double plays newest-first', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      const storage = new Storage(filePath);

      const data = makeData([
        makeDoublePlay('Oldest', 'Song', '2025-01-01T00:00:00Z', 'legitimate'),
        makeDoublePlay('Middle', 'Song', '2025-06-15T00:00:00Z', 'legitimate'),
        makeDoublePlay('Newest', 'Song', '2025-12-31T00:00:00Z', 'legitimate')
      ]);

      await storage.save(data);

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.doublePlays[0].artist).toBe('Newest');
      expect(raw.doublePlays[1].artist).toBe('Middle');
      expect(raw.doublePlays[2].artist).toBe('Oldest');
    });

    test('calculates correct classification counts', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      const storage = new Storage(filePath);

      const data = makeData([
        makeDoublePlay('A', 'Song', '2025-01-01T00:00:00Z', 'legitimate'),
        makeDoublePlay('B', 'Song', '2025-01-02T00:00:00Z', 'legitimate'),
        makeDoublePlay('C', 'Song', '2025-01-03T00:00:00Z', 'partial'),
        makeDoublePlay('D', 'Song', '2025-01-04T00:00:00Z', 'mistake'),
        makeDoublePlay('E', 'Song', '2025-01-05T00:00:00Z', 'mistake'),
        makeDoublePlay('F', 'Song', '2025-01-06T00:00:00Z', 'mistake'),
        makeDoublePlay('G', 'Song', '2025-01-07T00:00:00Z') // no classification -> defaults to partial in count
      ]);

      await storage.save(data);

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.counts.legitimate).toBe(2);
      expect(raw.counts.partial).toBe(2); // one explicit + one defaulted
      expect(raw.counts.mistake).toBe(3);
      expect(raw.counts.total).toBe(7);
    });

    test('throws on invalid data (missing required fields)', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      const storage = new Storage(filePath);

      const invalidData = {
        startTime: '2025-01-01T00:00:00Z',
        endTime: '2025-01-02T00:00:00Z',
        doublePlays: [
          {
            // missing artist and title
            plays: [makePlay(1, '2025-01-01T00:00:00Z')]
          }
        ],
        counts: { legitimate: 0, partial: 0, mistake: 0 }
      } as unknown as DoublePlayData;

      expect(storage.save(invalidData)).rejects.toThrow();
    });

    test('creates parent directory if needed', async () => {
      const nestedDir = path.join(tmpDir, 'a', 'b', 'c');
      const filePath = path.join(nestedDir, 'data.json');
      const storage = new Storage(filePath);

      const data = makeData([
        makeDoublePlay('Artist', 'Song', '2025-06-01T10:00:00Z', 'legitimate')
      ]);

      await storage.save(data);

      expect(fs.existsSync(filePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.doublePlays).toHaveLength(1);
    });

    test('throws on write to invalid path', async () => {
      const filePath = '/nonexistent/deeply/nested/path/file.json';
      const storage = new Storage(filePath);

      const data = makeData([
        makeDoublePlay('Artist', 'Song', '2025-06-01T10:00:00Z', 'legitimate')
      ]);

      expect(storage.save(data)).rejects.toThrow();
    });
  });
});
