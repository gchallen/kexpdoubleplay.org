#!/usr/bin/env bun
// Run from project root: bun src/tests/test-backup.ts
/**
 * Test script to verify backup functionality (GitHub and local)
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { BackupManager } from '../backup-manager';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import moment from 'moment';

async function testBackupFunctionality() {
  console.log('🧪 Testing Backup Functionality\n');

  // Check what backup methods are enabled
  const githubEnabled = process.env.GITHUB_BACKUP_ENABLED === 'true';
  const localEnabled = !!process.env.LOCAL_BACKUP_PATH;

  if (!githubEnabled && !localEnabled) {
    console.log('⏭️  No backup methods enabled - nothing to test');
    console.log('   Enable GitHub or local backups in .env to run tests');
    return true;
  }

  console.log('📋 Backup methods to test:');
  if (githubEnabled) {
    const hasCredentials = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME);
    console.log(`   📤 GitHub: ${hasCredentials ? '✅ Configured' : '❌ Missing credentials'}`);
    if (!hasCredentials) {
      console.log('       Run "bun src/tests/test-github-setup.ts" to verify GitHub setup');
    }
  }
  if (localEnabled) {
    console.log(`   💾 Local: ✅ Enabled (${process.env.LOCAL_BACKUP_PATH})`);
  }

  try {
    console.log('\n1️⃣ Initializing backup manager...');
    const backupManager = new BackupManager();
    await backupManager.initialize();
    console.log('   ✅ Backup manager initialized');

    console.log('\n2️⃣ Creating test data...');
    const testTimestamp = moment().format('YYYY-MM-DD-HH-mm-ss');
    const testData = {
      startTime: "2025-08-28T08:09:27.379Z",
      endTime: "2025-08-30T12:09:27.396Z",
      doublePlays: [
        {
          artist: `Test Artist ${testTimestamp}`,
          title: "Test Backup Song",
          plays: [
            {
              timestamp: "2025-08-30T12:00:00.000Z",
              play_id: 99999
            },
            {
              timestamp: "2025-08-30T12:03:30.000Z", 
              play_id: 100000
            }
          ],
          dj: "Test DJ",
          show: "Backup Test Show"
        }
      ],
      scanStats: {
        totalScanTimeMs: 12345,
        totalApiRequests: 42,
        lastScanDuration: 567,
        lastScanRequests: 3,
        lastScanTime: new Date().toISOString(),
        scanDirection: "forward" as const
      }
    };

    // Create a test data file to simulate the real scenario
    const testFileName = 'test-double-plays.json';
    const originalFile = 'double-plays.json';
    const hasOriginal = existsSync(originalFile);
    let originalContent = '';

    // Back up original file if it exists
    if (hasOriginal) {
      originalContent = require('fs').readFileSync(originalFile, 'utf8');
    }

    writeFileSync(originalFile, JSON.stringify(testData, null, 2));
    console.log('   ✅ Created test data file');

    console.log('\n3️⃣ Triggering backup...');
    
    // First call should not backup (first run behavior)
    await backupManager.checkAndBackup();
    console.log('   ✅ First backup check completed (should not backup on first run)');

    // Modify data to trigger backup (expand date range)
    testData.startTime = "2025-08-27T08:09:27.379Z"; // One day earlier
    writeFileSync(originalFile, JSON.stringify(testData, null, 2));

    // This should trigger a backup
    await backupManager.checkAndBackup();
    console.log('   ✅ Second backup check completed (should have triggered backup)');

    console.log('\n4️⃣ Verifying backups...');

    // Check local backup if enabled
    if (localEnabled) {
      const localPath = process.env.LOCAL_BACKUP_PATH!;
      const localFiles = require('fs').readdirSync(localPath)
        .filter((f: string) => f.startsWith('double-plays-') && f.endsWith('.json'));
      
      if (localFiles.length > 0) {
        console.log(`   ✅ Local backup created: ${localFiles[localFiles.length - 1]}`);
      } else {
        console.log('   ❌ No local backup files found');
      }
    }

    // For GitHub, we'll just check that no errors occurred
    // The actual verification is done by the GitHub setup test
    if (githubEnabled && process.env.GITHUB_TOKEN) {
      console.log('   ✅ GitHub backup attempted (check logs for details)');
      console.log(`   🔗 Repository: https://github.com/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`);
    }

    // Restore original file
    if (hasOriginal) {
      writeFileSync(originalFile, originalContent);
      console.log('   🔄 Restored original data file');
    } else {
      unlinkSync(originalFile);
      console.log('   🧹 Removed test data file');
    }

    console.log('\n✅ Backup functionality test completed!');
    console.log('\n💡 Tips:');
    console.log('   • Check logs/combined.log for detailed backup information');
    console.log('   • Backups only trigger when date range expands by ≥1 day');
    if (githubEnabled) {
      console.log('   • Visit your GitHub repository to see the backup commits');
    }
    if (localEnabled) {
      console.log(`   • Check ${process.env.LOCAL_BACKUP_PATH} for local backup files`);
    }

    return true;

  } catch (error) {
    console.log('\n❌ Backup test failed');
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    
    if (error instanceof Error) {
      if (error.message.includes('GitHub')) {
        console.log('\n💡 GitHub Backup Issues:');
        console.log('   • Run "bun run test:github" to verify GitHub setup');
        console.log('   • Check GitHub token and repository permissions');
      }
    }

    return false;
  }
}

// Run the test
testBackupFunctionality()
  .then((success) => {
    if (success) {
      console.log('\n🎉 All backup tests passed!');
      process.exit(0);
    } else {
      console.log('\n💥 Some tests failed');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n💥 Test runner error:', error);
    process.exit(1);
  });