// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import moment from 'moment';
import chalk from 'chalk';
import * as cron from 'node-cron';
import { KEXPApi } from './api';
import { DoublePlayDetector } from './detector';
import { Storage } from './storage';
import { BackupManager } from './backup-manager';
import { YouTubeManager } from './youtube-manager';
import { config } from './config';
import { DoublePlayData, ScanStats } from '@kexp-doubleplay/types';
import { ApiServer } from './api-server';
import { ScanQueue } from './scan-queue';
import logger from './logger';
import { CLIOptions } from './index';

export class Scanner {
  private api: KEXPApi;
  private detector: DoublePlayDetector;
  private storage: Storage;
  private backupManager: BackupManager;
  private youtubeManager: YouTubeManager;
  private data: DoublePlayData;
  private isRunning = false;
  private apiServer?: ApiServer;
  private scanQueue?: ScanQueue;
  private youtubeUpdateTask?: cron.ScheduledTask;
  private options: CLIOptions;

  constructor(options?: CLIOptions) {
    this.options = options || {
      restart: false,
      startDate: moment().subtract(365, 'days').format('YYYY-MM-DD'),
      backwardScan: false,
      forceLocal: false,
      forceBackup: false,
      progress: false,
      debug: false,
      dryRun: false
    };
    this.api = new KEXPApi();
    this.detector = new DoublePlayDetector(this.api);
    this.storage = new Storage(config.dataFilePath);
    this.backupManager = new BackupManager();
    this.youtubeManager = new YouTubeManager();
    this.data = {
      startTime: moment(this.options.startDate).toISOString(),
      endTime: moment().toISOString(),
      doublePlays: [],
      counts: {
        legitimate: 0,
        partial: 0,
        mistake: 0
      }
    };
  }

  private compareDataSets(data1: DoublePlayData, data2: DoublePlayData): number {
    // Compare by date range coverage (longer range is better)
    const range1 = moment(data1.endTime).diff(moment(data1.startTime), 'hours');
    const range2 = moment(data2.endTime).diff(moment(data2.startTime), 'hours');
    return range1 - range2;
  }

  async initialize(): Promise<void> {
    const hasRestartFlag = this.options.restart;
    const forceLocalFlag = this.options.forceLocal;
    const forceBackupFlag = this.options.forceBackup;
    const startDate = moment(this.options.startDate);

    logger.info(`Backward scan limit: ${this.options.startDate}`, {
      startDate: this.options.startDate,
      backwardScanOnly: this.options.backwardScan
    });

    // Initialize backup manager first
    await this.backupManager.initialize();
    
    let localData: DoublePlayData | null = null;
    let backupData: DoublePlayData | null = null;
    let dataSource = '';
    
    // Try to load local data (unless --force-backup is set)
    if (!forceBackupFlag) {
      try {
        localData = await this.storage.load();
        dataSource = 'local file';
      } catch (error) {
        logger.debug('No local data file found or failed to load');
      }
    }
    
    // Try to load backup data (unless restart flag is set or --force-local is set)
    if (!hasRestartFlag && !forceLocalFlag) {
      try {
        backupData = await this.backupManager.loadBestBackup();
      } catch (error) {
        logger.warn('Failed to load backup data', {
          error: error instanceof Error ? error.message : error
        });
      }
    } else if (hasRestartFlag) {
      logger.info('Restart flag detected - skipping backup loading');
    } else if (forceLocalFlag) {
      logger.info('Force local flag detected - using only local data');
    }
    
    // Decide which data to use
    if (forceLocalFlag && localData) {
      // Force local flag - use local data only
      this.data = localData;
      dataSource = 'local file (forced)';
      logger.info('Using local data - forced by --force-local flag');
    } else if (forceBackupFlag && backupData) {
      // Force backup flag - use backup data only
      this.data = backupData;
      dataSource = 'backup (forced)';
      logger.info('Using backup data - forced by --force-backup flag');
    } else if (!localData && backupData) {
      // No local data, use backup
      this.data = backupData;
      dataSource = 'backup (local file missing)';
      logger.info('Using backup data - local file not found');
    } else if (localData && backupData) {
      // Both available, compare by date range and use the one with longer range
      const comparison = this.compareDataSets(backupData, localData);
      if (comparison > 0) {
        this.data = backupData;
        dataSource = 'backup (longer date range than local)';
        const backupRange = moment(backupData.endTime).diff(moment(backupData.startTime), 'hours');
        const localRange = moment(localData.endTime).diff(moment(localData.startTime), 'hours');
        logger.info('Using backup data - backup has longer date range than local file', {
          backupRangeHours: backupRange,
          localRangeHours: localRange,
          backupRange: `${backupData.startTime} to ${backupData.endTime}`,
          localRange: `${localData.startTime} to ${localData.endTime}`
        });
      } else {
        this.data = localData;
        dataSource = 'local file (longer or equal date range to backup)';
      }
    } else if (localData) {
      // Only local data available
      this.data = localData;
      dataSource = 'local file';
    } else if (backupData) {
      // Only backup data available
      this.data = backupData;
      dataSource = 'backup (only source available)';
      logger.info('Using backup data - only available source');
    } else {
      // No data available, start fresh
      const now = moment();
      if (this.options.backwardScan) {
        // For backward-only mode, set startTime to one day after the target date
        // This ensures the backward scan will trigger and go to the target date
        const targetStart = moment(this.options.startDate);
        this.data = {
          startTime: targetStart.clone().add(1, 'day').toISOString(),
          endTime: now.toISOString(),
          doublePlays: [],
          counts: {
            legitimate: 0,
            partial: 0,
            mistake: 0
          }
        };
        dataSource = 'fresh start (backward-only mode)';
        logger.info('Starting fresh data for backward-only scan', {
          targetStartDate: this.options.startDate,
          dataStartTime: this.data.startTime
        });
      } else {
        // Normal mode: start from now and let backward scan handle the lookback period
        this.data = {
          startTime: now.toISOString(),
          endTime: now.toISOString(),
          doublePlays: [],
          counts: {
            legitimate: 0,
            partial: 0,
            mistake: 0
          }
        };
        dataSource = 'fresh start (no existing data)';
        const maxLookbackDays = Math.ceil(now.diff(startDate, 'days', true));
        logger.info('Starting with fresh data - backward scan will cover lookback period', {
          maxLookbackDays: maxLookbackDays
        });
      }
    }
    
    console.log(chalk.cyan('🎵 KEXP Double Play Scanner Initialized'));
    console.log(`   Data source: ${chalk.blue(dataSource)}`);
    console.log(`   Data range: ${chalk.yellow(moment(this.data.startTime).format('MMM DD, YYYY HH:mm'))} → ${chalk.yellow(moment(this.data.endTime).format('MMM DD, YYYY HH:mm'))}`);
    console.log(`   Existing double plays: ${chalk.green(this.data.doublePlays.length)}`);
    
    if (this.data.scanStats) {
      const totalHours = Math.round(this.data.scanStats.totalScanTimeMs / 1000 / 60 / 60 * 10) / 10;
      console.log(`   Scan statistics: ${chalk.cyan(this.data.scanStats.totalApiRequests)} requests, ${chalk.cyan(totalHours)}h total scan time`);
    }
    console.log();
    
    // If we loaded data from backup, save it to local file immediately
    if (dataSource.includes('backup')) {
      try {
        await this.storage.save(this.data);
        logger.info('Backup data saved to local file for future use');
      } catch (error) {
        logger.warn('Failed to save backup data to local file', {
          error: error instanceof Error ? error.message : error
        });
      }
    }
    
    logger.debug('Scanner initialized', {
      startTime: this.data.startTime,
      endTime: this.data.endTime,
      existingDoublePlays: this.data.doublePlays.length
    });
    
    // Start API server
    const apiPort = parseInt(process.env.API_PORT || '3000', 10);
    this.apiServer = new ApiServer(apiPort, this.api, undefined, this.youtubeManager);
    await this.apiServer.start();
    console.log(chalk.dim(`   API server: http://localhost:${apiPort}\n`));
    logger.debug('API server started', { port: apiPort });
    
    // Schedule periodic YouTube data updates (every 5 minutes)
    this.youtubeUpdateTask = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.youtubeManager.updateYouTubeData();
      } catch (error) {
        logger.error('YouTube data update failed', {
          error: error instanceof Error ? error.message : error
        });
      }
    });

    // Start the YouTube update task and perform initial update
    this.youtubeUpdateTask.start();
    await this.youtubeManager.updateYouTubeData(); // Initial update
    logger.debug('YouTube data update scheduled every 5 minutes');
  }


  private updateScanStats(direction: 'forward' | 'backward' | 'mixed', scanTimeMs: number, requestCount: number): void {
    const now = moment().toISOString();
    
    // Initialize scan stats if not present
    if (!this.data.scanStats) {
      this.data.scanStats = {
        totalScanTimeMs: 0,
        totalApiRequests: 0,
        lastScanDuration: 0,
        lastScanRequests: 0,
        lastScanTime: now,
        scanDirection: direction
      };
    }
    
    // Update statistics
    this.data.scanStats.totalScanTimeMs += scanTimeMs;
    this.data.scanStats.totalApiRequests += requestCount;
    this.data.scanStats.lastScanDuration = scanTimeMs;
    this.data.scanStats.lastScanRequests = requestCount;
    this.data.scanStats.lastScanTime = now;
    this.data.scanStats.scanDirection = direction;
  }

  private async saveDataWithBackupCheck(): Promise<void> {
    await this.storage.save(this.data);
    // Trigger immediate backup check after data save (async, non-blocking)
    this.backupManager.checkAndBackup().catch(error => {
      logger.error('Background backup check failed', {
        error: error instanceof Error ? error.message : error
      });
    });
  }

  async start(): Promise<void> {
    this.isRunning = true;
    
    try {
      this.apiServer?.updateScannerStatus('running');
      
      // Calculate max lookback days from startDate
      const startDateMoment = moment(this.options.startDate);
      const now = moment();
      const maxLookbackDays = Math.ceil(now.diff(startDateMoment, 'days', true));

      // Initialize and start the scan queue
      this.scanQueue = new ScanQueue(this.api, this.detector, this.storage, this.data, maxLookbackDays, this.options.backwardScan, this.options.backwardScan ? this.options.startDate : undefined);
      this.scanQueue.setOnScanComplete((direction, scanTimeMs, requestCount) => {
        this.updateScanStats(direction, scanTimeMs, requestCount);
      });
      this.scanQueue.setSaveDataHandler(() => this.saveDataWithBackupCheck());

      // Set up completion handler for backward-only mode
      if (this.options.backwardScan) {
        this.scanQueue.setOnBackwardScanComplete(() => {
          console.log(chalk.green('✅ Backward scan complete - exiting as requested'));
          this.stop().then(() => {
            process.exit(0);
          }).catch((error) => {
            logger.error('Error during shutdown after backward scan completion', { error });
            process.exit(1);
          });
        });
      }
      
      // Pass scan queue to API server for health monitoring
      this.apiServer?.setScanQueue(this.scanQueue);
      
      this.scanQueue.start();
      
      console.log(chalk.dim(`⏰ Queue-based scanning started - forward scans every ${config.scanIntervalMinutes} minutes...`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Scanner error', { error: errorMessage, stack: error instanceof Error ? error.stack : undefined });
      this.apiServer?.updateScannerStatus('error', errorMessage);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return; // Already stopped, prevent duplicate shutdown messages
    }
    
    this.isRunning = false;
    console.log(chalk.yellow('\n📴 Scanner stopping...'));
    
    // Stop YouTube update task
    if (this.youtubeUpdateTask) {
      this.youtubeUpdateTask.stop();
      logger.debug('Stopped YouTube update task');
    }
    
    // Stop the scan queue
    this.scanQueue?.stop();
    
    // Perform shutdown backup
    console.log(chalk.cyan('💾 Creating shutdown backup...'));
    await this.backupManager.performShutdownBackup(this.data);
    
    // Print final summary
    const totalDoublePlays = this.data.doublePlays.length;
    const timeSpan = moment(this.data.endTime).diff(moment(this.data.startTime), 'days');
    
    console.log(chalk.cyan('\n📊 Session Summary:'));
    console.log(`   Total double plays found: ${chalk.green(totalDoublePlays)}`);
    console.log(`   Data spans: ${chalk.yellow(timeSpan)} days`);
    console.log(`   Period: ${chalk.dim(moment(this.data.startTime).format('MMM DD'))} to ${chalk.dim(moment(this.data.endTime).format('MMM DD, YYYY'))}`);
    
    if (totalDoublePlays > 0) {
      console.log('\n🎵 Recent discoveries:');
      const recentPlays = this.data.doublePlays
        .slice(-3)
        .reverse();
      
      for (const dp of recentPlays) {
        console.log(`   • ${chalk.yellow(dp.artist)} - "${dp.title}"`);
      }
    }
    
    logger.info('Scanner stopping', { reason: 'Manual stop requested', totalDoublePlays, timeSpan });
    this.api.destroy(); // Cleanup HTTP connections
    this.apiServer?.updateScannerStatus('stopped');
    this.apiServer?.stop(); // Stop API server
    logger.info('Scanner stopped successfully');
    
    console.log(chalk.green('\n✨ Scanner stopped cleanly\n'));
  }
}