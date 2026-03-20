import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DoublePlayData } from '@kexp-doubleplay/types';

// Mutable config path that tests can override before creating a BackupManager
let testDataFilePath = './double-plays.json';
mock.module('./config', () => ({
  config: {
    get dataFilePath() { return testDataFilePath; },
    apiBaseUrl: 'https://api.kexp.org/v2',
    rateLimitDelay: 1000,
    scanIntervalMinutes: 5,
    maxHoursPerRequest: 1,
    apiPort: 3000,
    backupIntervalHours: 24,
  }
}));

import { BackupManager } from './backup-manager';

// Helper to create a DoublePlayData fixture
const makeData = (startTime: string, endTime: string, count = 0): DoublePlayData => ({
  startTime,
  endTime,
  doublePlays: [],
  counts: { legitimate: 0, partial: 0, mistake: 0 }
});

// Helper to create a temp directory for tests
function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Store original env vars and restore after each test
let savedEnv: Record<string, string | undefined>;

function saveEnv() {
  savedEnv = {
    GITHUB_BACKUP_ENABLED: process.env.GITHUB_BACKUP_ENABLED,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER,
    GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME,
    GITHUB_FILE_PATH: process.env.GITHUB_FILE_PATH,
    LOCAL_BACKUP_PATH: process.env.LOCAL_BACKUP_PATH,
  };
}

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

// Set env for local-only backup (GitHub disabled)
function setLocalOnlyEnv(localPath: string) {
  delete process.env.GITHUB_BACKUP_ENABLED;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPO_OWNER;
  delete process.env.GITHUB_REPO_NAME;
  delete process.env.GITHUB_FILE_PATH;
  process.env.LOCAL_BACKUP_PATH = localPath;
}

// Set env with no backup methods enabled
function setNoBackupEnv() {
  delete process.env.GITHUB_BACKUP_ENABLED;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPO_OWNER;
  delete process.env.GITHUB_REPO_NAME;
  delete process.env.GITHUB_FILE_PATH;
  delete process.env.LOCAL_BACKUP_PATH;
}

describe('BackupManager', () => {
  beforeEach(() => {
    saveEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  describe('compareBackups', () => {
    test('returns positive when first backup has longer date range', () => {
      setNoBackupEnv();
      const manager = new BackupManager();

      // backup1: 10 days range, backup2: 5 days range
      const backup1 = makeData('2025-01-01T00:00:00Z', '2025-01-11T00:00:00Z');
      const backup2 = makeData('2025-01-01T00:00:00Z', '2025-01-06T00:00:00Z');

      const result = manager.compareBackups(backup1, backup2);
      expect(result).toBeGreaterThan(0);
    });

    test('returns negative when second backup has longer date range', () => {
      setNoBackupEnv();
      const manager = new BackupManager();

      const backup1 = makeData('2025-01-01T00:00:00Z', '2025-01-03T00:00:00Z');
      const backup2 = makeData('2025-01-01T00:00:00Z', '2025-01-10T00:00:00Z');

      const result = manager.compareBackups(backup1, backup2);
      expect(result).toBeLessThan(0);
    });

    test('returns zero when both backups have equal date range', () => {
      setNoBackupEnv();
      const manager = new BackupManager();

      const backup1 = makeData('2025-01-01T00:00:00Z', '2025-01-05T00:00:00Z');
      const backup2 = makeData('2025-02-01T00:00:00Z', '2025-02-05T00:00:00Z');

      const result = manager.compareBackups(backup1, backup2);
      expect(result).toBe(0);
    });

    test('handles different start times correctly', () => {
      setNoBackupEnv();
      const manager = new BackupManager();

      // backup1 starts earlier, giving it a longer range
      const backup1 = makeData('2025-01-01T00:00:00Z', '2025-01-10T00:00:00Z');
      const backup2 = makeData('2025-01-05T00:00:00Z', '2025-01-10T00:00:00Z');

      const result = manager.compareBackups(backup1, backup2);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('checkAndBackup', () => {
    test('skips when no data file exists', async () => {
      const tmpDir = createTempDir('backup-test-nodata-');
      const localBackupDir = path.join(tmpDir, 'backups');
      setLocalOnlyEnv(localBackupDir);
      testDataFilePath = path.join(tmpDir, 'double-plays.json'); // does not exist

      const manager = new BackupManager();

      try {
        await manager.checkAndBackup();

        // No backup files should have been created
        if (fs.existsSync(localBackupDir)) {
          const files = fs.readdirSync(localBackupDir)
            .filter(f => f.startsWith('double-plays-') && f.endsWith('.json'));
          expect(files.length).toBe(0);
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('skips on first call (records range but does not backup)', async () => {
      const tmpDir = createTempDir('backup-test-first-');
      const localBackupDir = path.join(tmpDir, 'backups');
      const dataFile = path.join(tmpDir, 'double-plays.json');
      setLocalOnlyEnv(localBackupDir);
      testDataFilePath = dataFile;

      const manager = new BackupManager();

      // Write a data file
      const data = makeData('2025-01-01T00:00:00Z', '2025-01-05T00:00:00Z');
      fs.writeFileSync(dataFile, JSON.stringify(data));

      try {
        await manager.checkAndBackup();

        // First call should not create any backups (shouldBackup returns false on first call)
        if (fs.existsSync(localBackupDir)) {
          const files = fs.readdirSync(localBackupDir)
            .filter(f => f.startsWith('double-plays-') && f.endsWith('.json'));
          expect(files.length).toBe(0);
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('triggers backup when date range expands by >= 1 day', async () => {
      const tmpDir = createTempDir('backup-test-expand-');
      const localBackupDir = path.join(tmpDir, 'backups');
      const dataFile = path.join(tmpDir, 'double-plays.json');
      setLocalOnlyEnv(localBackupDir);
      testDataFilePath = dataFile;

      const manager = new BackupManager();

      try {
        // First call: record initial range
        const data1 = makeData('2025-01-01T00:00:00Z', '2025-01-05T00:00:00Z');
        fs.writeFileSync(dataFile, JSON.stringify(data1));
        await manager.checkAndBackup();

        // Second call with same range: should not backup
        await manager.checkAndBackup();
        if (fs.existsSync(localBackupDir)) {
          const files = fs.readdirSync(localBackupDir)
            .filter(f => f.startsWith('double-plays-') && f.endsWith('.json'));
          expect(files.length).toBe(0);
        }

        // Third call with expanded range (end date moved forward by 2 days)
        const data2 = makeData('2025-01-01T00:00:00Z', '2025-01-07T00:00:00Z');
        fs.writeFileSync(dataFile, JSON.stringify(data2));
        await manager.checkAndBackup();

        // Now a backup should have been created
        expect(fs.existsSync(localBackupDir)).toBe(true);
        const files = fs.readdirSync(localBackupDir)
          .filter(f => f.startsWith('double-plays-') && f.endsWith('.json'));
        expect(files.length).toBe(1);

        // Verify backup content
        const backupContent = JSON.parse(
          fs.readFileSync(path.join(localBackupDir, files[0]), 'utf8')
        ) as DoublePlayData;
        expect(backupContent.startTime).toBe('2025-01-01T00:00:00Z');
        expect(backupContent.endTime).toBe('2025-01-07T00:00:00Z');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('concurrent backup serialization', () => {
    test('isBackupInProgress flag prevents concurrent GitHub uploads', async () => {
      const tmpDir = createTempDir('backup-test-concurrent-');
      const localBackupDir = path.join(tmpDir, 'backups');

      // Enable both local and GitHub backups (GitHub will fail but we are testing the flag)
      process.env.GITHUB_BACKUP_ENABLED = 'true';
      process.env.GITHUB_TOKEN = 'fake-token';
      process.env.GITHUB_REPO_OWNER = 'fake-owner';
      process.env.GITHUB_REPO_NAME = 'fake-repo';
      process.env.LOCAL_BACKUP_PATH = localBackupDir;

      const manager = new BackupManager();
      const data = makeData('2025-01-01T00:00:00Z', '2025-01-10T00:00:00Z');

      // Manually set the isBackupInProgress flag to simulate a concurrent upload
      (manager as any).isBackupInProgress = true;

      // performShutdownBackup calls createBackups, which should skip GitHub upload
      // when isBackupInProgress is true
      await manager.performShutdownBackup(data);

      // Local backup should still be created (local is not gated by isBackupInProgress)
      expect(fs.existsSync(localBackupDir)).toBe(true);
      const files = fs.readdirSync(localBackupDir)
        .filter(f => f.startsWith('double-plays-') && f.endsWith('.json'));
      expect(files.length).toBe(1);

      // The flag should still be true since GitHub upload was skipped (not reset in finally block)
      expect((manager as any).isBackupInProgress).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('cleanupOldLocalBackups', () => {
    test('keeps only 10 most recent backup files', async () => {
      const tmpDir = createTempDir('backup-test-cleanup-');
      const localBackupDir = path.join(tmpDir, 'backups');
      fs.mkdirSync(localBackupDir, { recursive: true });
      setLocalOnlyEnv(localBackupDir);

      // Create 15 backup files with different modification times
      for (let i = 0; i < 15; i++) {
        const paddedIndex = String(i).padStart(2, '0');
        const filename = `double-plays-2025-01-01-00-00-${paddedIndex}.json`;
        const filepath = path.join(localBackupDir, filename);
        const data = makeData('2025-01-01T00:00:00Z', '2025-01-05T00:00:00Z');
        fs.writeFileSync(filepath, JSON.stringify(data));
        // Set distinct modification times so sort order is deterministic
        const mtime = new Date(2025, 0, 1, 0, 0, i);
        fs.utimesSync(filepath, mtime, mtime);
      }

      // Verify we have 15 files
      let files = fs.readdirSync(localBackupDir)
        .filter(f => f.startsWith('double-plays-') && f.endsWith('.json'));
      expect(files.length).toBe(15);

      const dataFile = path.join(tmpDir, 'double-plays.json');
      testDataFilePath = dataFile;

      const manager = new BackupManager();

      try {
        // First call records the range (shouldBackup returns false)
        const data1 = makeData('2025-01-01T00:00:00Z', '2025-01-05T00:00:00Z');
        fs.writeFileSync(dataFile, JSON.stringify(data1));
        await manager.checkAndBackup();

        // Second call with expanded range triggers backup + cleanup
        const data2 = makeData('2025-01-01T00:00:00Z', '2025-01-10T00:00:00Z');
        fs.writeFileSync(dataFile, JSON.stringify(data2));
        await manager.checkAndBackup();

        // After cleanup, should have 10 files (15 existing - 5 oldest + 1 new = 11, then cleanup keeps 10)
        // Actually: 15 + 1 new = 16 files total, cleanup keeps newest 10
        files = fs.readdirSync(localBackupDir)
          .filter(f => f.startsWith('double-plays-') && f.endsWith('.json'));
        expect(files.length).toBe(10);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('loadBestBackup', () => {
    test('returns null when no backups are available', async () => {
      const tmpDir = createTempDir('backup-test-load-');
      const localBackupDir = path.join(tmpDir, 'backups');
      fs.mkdirSync(localBackupDir, { recursive: true });

      // Local enabled but no GitHub, and empty backup directory
      setLocalOnlyEnv(localBackupDir);

      const manager = new BackupManager();
      const result = await manager.loadBestBackup();

      expect(result).toBeNull();

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('loads local backup when available', async () => {
      const tmpDir = createTempDir('backup-test-load-local-');
      const localBackupDir = path.join(tmpDir, 'backups');
      fs.mkdirSync(localBackupDir, { recursive: true });

      setLocalOnlyEnv(localBackupDir);

      // Write a backup file
      const data = makeData('2025-01-01T00:00:00Z', '2025-01-15T00:00:00Z');
      const backupFile = path.join(localBackupDir, 'double-plays-2025-01-15-12-00-00.json');
      fs.writeFileSync(backupFile, JSON.stringify(data));

      const manager = new BackupManager();
      const result = await manager.loadBestBackup();

      expect(result).not.toBeNull();
      expect(result!.startTime).toBe('2025-01-01T00:00:00Z');
      expect(result!.endTime).toBe('2025-01-15T00:00:00Z');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('loads most recent local backup when multiple exist', async () => {
      const tmpDir = createTempDir('backup-test-load-multi-');
      const localBackupDir = path.join(tmpDir, 'backups');
      fs.mkdirSync(localBackupDir, { recursive: true });

      setLocalOnlyEnv(localBackupDir);

      // Write an older backup
      const oldData = makeData('2025-01-01T00:00:00Z', '2025-01-05T00:00:00Z');
      const oldFile = path.join(localBackupDir, 'double-plays-2025-01-05-12-00-00.json');
      fs.writeFileSync(oldFile, JSON.stringify(oldData));
      fs.utimesSync(oldFile, new Date(2025, 0, 5), new Date(2025, 0, 5));

      // Write a newer backup
      const newData = makeData('2025-01-01T00:00:00Z', '2025-01-20T00:00:00Z');
      const newFile = path.join(localBackupDir, 'double-plays-2025-01-20-12-00-00.json');
      fs.writeFileSync(newFile, JSON.stringify(newData));
      fs.utimesSync(newFile, new Date(2025, 0, 20), new Date(2025, 0, 20));

      const manager = new BackupManager();
      const result = await manager.loadBestBackup();

      expect(result).not.toBeNull();
      // Should load the most recent file (by mtime), which has the Jan 20 end date
      expect(result!.endTime).toBe('2025-01-20T00:00:00Z');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('performShutdownBackup', () => {
    test('creates local backup with provided data', async () => {
      const tmpDir = createTempDir('backup-test-shutdown-');
      const localBackupDir = path.join(tmpDir, 'backups');
      setLocalOnlyEnv(localBackupDir);

      const manager = new BackupManager();
      const data = makeData('2025-01-01T00:00:00Z', '2025-01-10T00:00:00Z');

      await manager.performShutdownBackup(data);

      expect(fs.existsSync(localBackupDir)).toBe(true);
      const files = fs.readdirSync(localBackupDir)
        .filter(f => f.startsWith('double-plays-') && f.endsWith('.json'));
      expect(files.length).toBe(1);

      // Verify content
      const backupContent = JSON.parse(
        fs.readFileSync(path.join(localBackupDir, files[0]), 'utf8')
      ) as DoublePlayData;
      expect(backupContent.startTime).toBe('2025-01-01T00:00:00Z');
      expect(backupContent.endTime).toBe('2025-01-10T00:00:00Z');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('skips when no backup methods are enabled', async () => {
      setNoBackupEnv();

      const manager = new BackupManager();
      const data = makeData('2025-01-01T00:00:00Z', '2025-01-10T00:00:00Z');

      // Should complete without error
      await manager.performShutdownBackup(data);
    });
  });
});
