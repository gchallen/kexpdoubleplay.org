import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { BackupManager } from '../backup-manager';
import { DoublePlayData } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';

describe('Shutdown Backup', () => {
  const testBackupPath = './test-backups';
  const testDataFile = './test-double-plays.json';
  
  beforeEach(() => {
    // Clean up test directories and files
    if (fs.existsSync(testBackupPath)) {
      fs.rmSync(testBackupPath, { recursive: true, force: true });
    }
    if (fs.existsSync(testDataFile)) {
      fs.unlinkSync(testDataFile);
    }
    
    // Set environment for local backup
    process.env.LOCAL_BACKUP_PATH = testBackupPath;
    process.env.GITHUB_BACKUP_ENABLED = 'false';
  });
  
  afterEach(() => {
    // Clean up
    if (fs.existsSync(testBackupPath)) {
      fs.rmSync(testBackupPath, { recursive: true, force: true });
    }
    if (fs.existsSync(testDataFile)) {
      fs.unlinkSync(testDataFile);
    }
    
    // Reset environment
    delete process.env.LOCAL_BACKUP_PATH;
    delete process.env.GITHUB_BACKUP_ENABLED;
  });
  
  test('performShutdownBackup creates backup on clean shutdown', async () => {
    const backupManager = new BackupManager();
    await backupManager.initialize();
    
    const testData: DoublePlayData = {
      startTime: moment().subtract(7, 'days').toISOString(),
      endTime: moment().toISOString(),
      doublePlays: [
        {
          artist: 'Test Artist',
          title: 'Test Song',
          plays: [
            {
              timestamp: moment().subtract(1, 'hour').toISOString(),
              play_id: 1,
              kexpPlay: {
                airdate: moment().subtract(1, 'hour').toISOString(),
                artist: 'Test Artist',
                song: 'Test Song',
                play_id: 1,
                play_type: 'trackplay'
              }
            },
            {
              timestamp: moment().subtract(55, 'minutes').toISOString(),
              play_id: 2,
              kexpPlay: {
                airdate: moment().subtract(55, 'minutes').toISOString(),
                artist: 'Test Artist',
                song: 'Test Song',
                play_id: 2,
                play_type: 'trackplay'
              }
            }
          ],
          classification: 'legitimate'
        }
      ],
      counts: {
        legitimate: 1,
        partial: 0,
        mistake: 0,
        total: 1
      }
    };
    
    // Perform shutdown backup
    await backupManager.performShutdownBackup(testData);
    
    // Check that backup was created
    expect(fs.existsSync(testBackupPath)).toBe(true);
    
    const backupFiles = fs.readdirSync(testBackupPath)
      .filter(file => file.startsWith('double-plays-') && file.endsWith('.json'));
    
    expect(backupFiles.length).toBeGreaterThan(0);
    
    // Verify backup content
    const backupFile = path.join(testBackupPath, backupFiles[0]);
    const backupContent = JSON.parse(fs.readFileSync(backupFile, 'utf8')) as DoublePlayData;
    
    expect(backupContent.doublePlays.length).toBe(1);
    expect(backupContent.doublePlays[0].artist).toBe('Test Artist');
    expect(backupContent.doublePlays[0].title).toBe('Test Song');
    expect(backupContent.counts.legitimate).toBe(1);
    
    console.log('✓ Shutdown backup created successfully');
    console.log(`  Backup file: ${backupFiles[0]}`);
    console.log(`  Contains ${backupContent.doublePlays.length} double play(s)`);
  });
  
  test('performShutdownBackup handles no data gracefully', async () => {
    const backupManager = new BackupManager();
    await backupManager.initialize();
    
    // Call without data and without a data file
    await backupManager.performShutdownBackup();
    
    // Should complete without error
    expect(true).toBe(true);
    console.log('✓ Handled missing data gracefully during shutdown backup');
  });
  
  test('performShutdownBackup works when no backup methods are enabled', async () => {
    // Disable all backup methods
    delete process.env.LOCAL_BACKUP_PATH;
    process.env.GITHUB_BACKUP_ENABLED = 'false';
    
    const backupManager = new BackupManager();
    await backupManager.initialize();
    
    const testData: DoublePlayData = {
      startTime: moment().subtract(1, 'day').toISOString(),
      endTime: moment().toISOString(),
      doublePlays: [],
      counts: {
        legitimate: 0,
        partial: 0,
        mistake: 0,
        total: 0
      }
    };
    
    // Should complete without error even when no backup methods are enabled
    await backupManager.performShutdownBackup(testData);
    
    expect(true).toBe(true);
    console.log('✓ Handled disabled backup methods gracefully');
  });
});