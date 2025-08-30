import moment from 'moment';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { KEXPApi } from './api';
import { DoublePlayDetector } from './detector';
import { Storage } from './storage';
import { config } from './config';
import { DoublePlayData } from './types';
import { ApiServer } from './api-server';
import { ScanQueue } from './scan-queue';
import logger from './logger';

export class Scanner {
  private api: KEXPApi;
  private detector: DoublePlayDetector;
  private storage: Storage;
  private data: DoublePlayData;
  private isRunning = false;
  private apiServer?: ApiServer;
  private scanQueue?: ScanQueue;

  constructor() {
    this.api = new KEXPApi();
    this.detector = new DoublePlayDetector(this.api);
    this.storage = new Storage(config.dataFilePath);
    this.data = {
      startTime: moment().subtract(7, 'days').toISOString(),
      endTime: moment().toISOString(),
      doublePlays: []
    };
  }

  async initialize(): Promise<void> {
    this.data = await this.storage.load();
    console.log(chalk.cyan('🎵 KEXP Double Play Scanner Initialized'));
    console.log(`   Data range: ${chalk.yellow(moment(this.data.startTime).format('MMM DD, YYYY HH:mm'))} → ${chalk.yellow(moment(this.data.endTime).format('MMM DD, YYYY HH:mm'))}`);
    console.log(`   Existing double plays: ${chalk.green(this.data.doublePlays.length)}\n`);
    
    logger.debug('Scanner initialized', {
      startTime: this.data.startTime,
      endTime: this.data.endTime,
      existingDoublePlays: this.data.doublePlays.length
    });
    
    // Start API server
    const apiPort = parseInt(process.env.API_PORT || '3000', 10);
    this.apiServer = new ApiServer(apiPort, this.api);
    await this.apiServer.start();
    console.log(chalk.dim(`   API server: http://localhost:${apiPort}\n`));
    logger.debug('API server started', { port: apiPort });
  }

  async start(): Promise<void> {
    this.isRunning = true;
    
    try {
      this.apiServer?.updateScannerStatus('running');
      
      // Initialize and start the scan queue
      this.scanQueue = new ScanQueue(this.api, this.detector, this.storage, this.data);
      this.scanQueue.start();
      
      console.log(chalk.dim(`⏰ Queue-based scanning started - forward scans every ${config.scanIntervalMinutes} minutes...`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Scanner error', { error: errorMessage, stack: error instanceof Error ? error.stack : undefined });
      this.apiServer?.updateScannerStatus('error', errorMessage);
      throw error;
    }
  }

  stop(): void {
    if (!this.isRunning) {
      return; // Already stopped, prevent duplicate shutdown messages
    }
    
    this.isRunning = false;
    console.log(chalk.yellow('\n📴 Scanner stopping...'));
    
    // Stop the scan queue
    this.scanQueue?.stop();
    
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

  /* DEPRECATED: Replaced by ScanQueue
  private async scanForward(): Promise<void> {
    const endTime = moment(this.data.endTime);
    const now = moment();
    
    if (endTime.isBefore(now)) {
      const hours = now.diff(endTime, 'hours', true);
      console.log(chalk.blue(`📡 Forward scan: ${chalk.white(hours.toFixed(1))} hours to catch up`));
      logger.info('Starting forward scan', { 
        from: endTime.toISOString(), 
        to: now.toISOString(),
        durationHours: hours
      });
      await this.scanRange(endTime, now, 'forward');
      this.data.endTime = now.toISOString();
      await this.storage.save(this.data);
    } else {
      console.log(chalk.dim('✓ Already up to date'));
      logger.debug('Skipping forward scan - already up to date');
    }
  }
  */

  
  /* DEPRECATED: Replaced by ScanQueue
  private async scanBackward(): Promise<void> {
    const stopDate = config.historicalScanStopDate ? moment(config.historicalScanStopDate) : null;
    const stopText = stopDate ? `until ${stopDate.format('MMM DD, YYYY')}` : 'to find ALL double plays';
    
    console.log(chalk.blue(`📅 Historical scan: Going back ${stopText}...`));
    
    let currentStartTime = moment(this.data.startTime);
    let totalDaysScanned = 0;
    let chunkCount = 0;
    
    while (this.isRunning) {
      const targetTime = currentStartTime.clone().subtract(7, 'days');
      chunkCount++;
      
      // Check if we've reached the configured stop date
      if (stopDate && targetTime.isBefore(stopDate)) {
        console.log(chalk.green(`\n🛑 Reached configured stop date: ${stopDate.format('MMM DD, YYYY')}`));
        console.log(chalk.cyan(`   Total historical period: ${totalDaysScanned} days scanned`));
        break;
      }
      
      console.log(chalk.cyan(`\n📊 Chunk ${chunkCount}: ${targetTime.format('MMM DD, YYYY')} → ${currentStartTime.format('MMM DD, YYYY')}`));
      
      try {
        // Scan this chunk for double plays with progress bar (handles hour-by-hour chunking)
        await this.scanRange(targetTime, currentStartTime, 'backward');
        
        // Update our position
        this.data.startTime = targetTime.toISOString();
        await this.storage.save(this.data);
        
        // Move further back
        const daysInChunk = currentStartTime.diff(targetTime, 'days');
        totalDaysScanned += daysInChunk;
        currentStartTime = targetTime;
        
        // Check if scanRange found any data - if scanRange processes 0 plays across all hours, 
        // we've likely reached the beginning of KEXP data
        // (We'll rely on the progress bar completion and empty results detection in scanRange)
        
      } catch (error) {
        logger.error('Error during backward scan chunk', {
          targetTime: targetTime.toISOString(),
          currentStartTime: currentStartTime.toISOString(),
          error: error instanceof Error ? error.message : error
        });
        
        // Check if this is an API health issue
        const healthStatus = this.api.getHealthStatus();
        if (!healthStatus.isHealthy) {
          console.log(chalk.yellow(`⚠️  API issues during historical scan - will resume when healthy`));
          break; // Exit backward scan, let periodic scans handle retry
        }
        
        // For other errors, continue with next chunk
        currentStartTime = targetTime;
      }
    }
    
    console.log(chalk.green(`\n✅ Historical scan complete! Scanned ${totalDaysScanned} days total`));
  }
  */

  /* DEPRECATED: Replaced by ScanQueue
  private async scanRange(
    startTime: moment.Moment, 
    endTime: moment.Moment, 
    direction: 'forward' | 'backward'
  ): Promise<void> {
    console.log(chalk.magenta(`🔍 DEBUG: scanRange called - ${direction} from ${startTime.format('MMM DD HH:mm')} to ${endTime.format('MMM DD HH:mm')}`));
    const hourChunks: Array<{ start: moment.Moment; end: moment.Moment }> = [];
    
    let current = startTime.clone();
    while (current.isBefore(endTime)) {
      const chunkEnd = moment.min(
        current.clone().add(config.maxHoursPerRequest, 'hours'),
        endTime
      );
      hourChunks.push({ start: current.clone(), end: chunkEnd });
      current = chunkEnd;
    }
    
    const chunks = direction === 'backward' ? hourChunks.reverse() : hourChunks;
    
    // Create progress bar
    const progressBar = new cliProgress.SingleBar({
      format: `   ${chalk.cyan('{bar}')} {percentage}% | {value}/{total} chunks | {eta_formatted} remaining`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: true
    }, cliProgress.Presets.shades_classic);
    
    console.log(chalk.dim(`   Processing ${chunks.length} hour-chunks...`));
    
    progressBar.start(chunks.length, 0);
    let processedChunks = 0;
    let totalPlaysScanned = 0;
    
    for (const chunk of chunks) {
      if (!this.isRunning) break;
      
      logger.debug('Scanning chunk', {
        start: chunk.start.toISOString(),
        end: chunk.end.toISOString(),
        direction
      });
      
      try {
        const plays = await this.api.getPlays(chunk.start, chunk.end);
        totalPlaysScanned += plays.length;
        
        // Update progress continuously - save startTime/endTime after each chunk
        if (direction === 'forward') {
          this.data.endTime = chunk.end.toISOString();
        } else {
          this.data.startTime = chunk.start.toISOString();
        }
        
        const newDoublePlays = await this.detector.detectDoublePlays(plays);
        if (newDoublePlays.length > 0) {
          // Stop progress bar for big announcement
          progressBar.stop();
          
          console.log('\n' + '='.repeat(60));
          console.log(chalk.bgGreen.black.bold(' 🎉 DOUBLE PLAY DISCOVERED! 🎉 '));
          console.log('='.repeat(60));
          
          for (const dp of newDoublePlays) {
            console.log(chalk.yellow.bold(`🎵 ${dp.artist} - "${dp.title}"`));
            console.log(`   Played at: ${dp.plays.map(p => moment(p.playedAt).format('MMM DD HH:mm')).join(', ')}`);
            if (dp.show) {
              console.log(`   Show: ${chalk.cyan(dp.show)} ${dp.dj ? `(${dp.dj})` : ''}`);
            }
          }
          
          console.log('='.repeat(60) + '\n');
          
          logger.info('Double plays detected!', { 
            count: newDoublePlays.length,
            plays: newDoublePlays.map(dp => `${dp.artist} - ${dp.title}`)
          });
          
          this.data.doublePlays = this.detector.mergeDoublePlays(
            this.data.doublePlays,
            newDoublePlays
          );
        }
        
        // Save progress after each chunk (includes timestamp updates and any new double plays)
        await this.storage.save(this.data);
        
        processedChunks++;
        progressBar.update(processedChunks);
        
        // Update last scan time
        this.apiServer?.updateScannerStatus('running');
      } catch (error) {
        const healthStatus = this.api.getHealthStatus();
        
        // Log error but don't spam console during progress
        logger.warn('Chunk scan failed', {
          error: error instanceof Error ? error.message : error,
          chunkStart: chunk.start.toISOString(),
          chunkEnd: chunk.end.toISOString(),
          apiHealthy: healthStatus.isHealthy,
          consecutiveFailures: healthStatus.consecutiveFailures
        });
        
        // Check if this is an API health issue
        if (!healthStatus.isHealthy) {
          this.apiServer?.updateScannerStatus('error', `KEXP API unavailable (${healthStatus.consecutiveFailures} consecutive failures)`);
          
          // If we have many failures, show warning
          if (healthStatus.consecutiveFailures >= 3) {
            progressBar.stop();
            console.log(chalk.yellow(`\n⚠️  KEXP API issues detected (${healthStatus.consecutiveFailures} failures) - using backoff\n`));
            progressBar.start(chunks.length, processedChunks);
            
            logger.warn('API in degraded state, relying on exponential backoff', {
              consecutiveFailures: healthStatus.consecutiveFailures
            });
          }
        }
        
        processedChunks++;
        progressBar.update(processedChunks);
      }
    }
    
    progressBar.stop();
    
    // Summary
    const timeRange = `${startTime.format('MMM DD')} - ${endTime.format('MMM DD')}`;
    console.log(chalk.green(`✓ Scan complete: ${timeRange} (${totalPlaysScanned.toLocaleString()} plays scanned)`));
  }
  */

  /* DEPRECATED: Replaced by ScanQueue
  private schedulePeriodicScan(): void {
    const intervalMs = config.scanIntervalMinutes * 60 * 1000;
    
    const periodicScan = async () => {
      if (!this.isRunning) return;
      
      const now = moment();
      const lastEndTime = moment(this.data.endTime);
      
      if (lastEndTime.isBefore(now)) {
        const minutesBehind = now.diff(lastEndTime, 'minutes');
        console.log(chalk.dim(`\n🔄 Periodic scan (${minutesBehind}min behind) - ${now.format('HH:mm:ss')}`));
        
        try {
          await this.scanRange(lastEndTime, now, 'forward');
          this.data.endTime = now.toISOString();
          await this.storage.save(this.data);
        } catch (error) {
          logger.error('Error in periodic scan', {
            error: error instanceof Error ? error.message : error
          });
          
          // Check API health and update status accordingly
          const healthStatus = this.api.getHealthStatus();
          if (!healthStatus.isHealthy) {
            console.log(chalk.red(`⚠️  API unavailable - will retry next cycle`));
            this.apiServer?.updateScannerStatus('error', `KEXP API unavailable during periodic scan`);
          }
        }
      } else {
        // Just a quiet heartbeat
        logger.debug('Periodic scan heartbeat - up to date');
      }
      
      if (this.isRunning) {
        setTimeout(periodicScan, intervalMs);
      }
    };
    
    setTimeout(periodicScan, intervalMs);
    console.log(chalk.dim(`\n⏰ Monitoring every ${config.scanIntervalMinutes} minutes...\n`));
    console.log(chalk.gray('────────────────────────────────────────'));
  }
  */
}