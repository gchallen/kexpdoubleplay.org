import moment from 'moment';
import { KEXPApi } from './api';
import { DoublePlayDetector } from './detector';
import { Storage } from './storage';
import { config } from './config';
import { DoublePlayData } from './types';
import { ProgressMonitor } from './progress-monitor';
import { ScannerStateManager } from './scanner-state';
import logger from './logger';

interface ScanJob {
  type: 'forward' | 'backward';
  startTime: moment.Moment;
  endTime: moment.Moment;
}

export class ScanQueue {
  private queue: ScanJob[] = [];
  private processing = false;
  private forwardScanTimer?: NodeJS.Timeout;
  private api: KEXPApi;
  private detector: DoublePlayDetector;
  private storage: Storage;
  private data: DoublePlayData;
  private isRunning = false;
  private progressMonitor: ProgressMonitor;
  private stateManager: ScannerStateManager;
  private onScanComplete?: (direction: 'forward' | 'backward' | 'mixed', scanTimeMs: number, requestCount: number) => void;
  private saveData?: () => Promise<void>;

  constructor(api: KEXPApi, detector: DoublePlayDetector, storage: Storage, data: DoublePlayData) {
    this.api = api;
    this.detector = detector;
    this.storage = storage;
    this.data = data;
    this.stateManager = new ScannerStateManager();
    this.progressMonitor = new ProgressMonitor(data, this.stateManager);
  }

  setOnScanComplete(callback: (direction: 'forward' | 'backward' | 'mixed', scanTimeMs: number, requestCount: number) => void): void {
    this.onScanComplete = callback;
  }

  setSaveDataHandler(saveHandler: () => Promise<void>): void {
    this.saveData = saveHandler;
  }

  start(): void {
    this.isRunning = true;
    this.stateManager.setRunning(true);
    this.progressMonitor.start();
    this.startPeriodicForwardScans();
    this.enqueueInitialBackwardScan();
    this.processQueue();
  }

  stop(): void {
    this.isRunning = false;
    this.stateManager.setRunning(false);
    this.stateManager.setScanIdle();
    if (this.forwardScanTimer) {
      clearInterval(this.forwardScanTimer);
      this.forwardScanTimer = undefined;
    }
    this.progressMonitor.stop();
  }

  private startPeriodicForwardScans(): void {
    const intervalMs = config.scanIntervalMinutes * 60 * 1000;
    
    logger.debug('Starting periodic forward scan timer', {
      intervalMinutes: config.scanIntervalMinutes,
      intervalMs: intervalMs
    });
    
    // Queue an initial forward scan immediately if needed
    const now = moment();
    const lastEndTime = moment(this.data.endTime);
    if (lastEndTime.isBefore(now)) {
      logger.debug('Adding initial forward scan job', {
        from: lastEndTime.toISOString(),
        to: now.toISOString()
      });
      this.queue.unshift({
        type: 'forward',
        startTime: lastEndTime,
        endTime: now
      });
      this.processQueue();
    }
    
    this.forwardScanTimer = setInterval(() => {
      if (!this.isRunning) return;
      
      const now = moment();
      const lastEndTime = moment(this.data.endTime);
      
      if (lastEndTime.isBefore(now)) {
        logger.debug('Adding periodic forward scan job', {
          from: lastEndTime.toISOString(),
          to: now.toISOString()
        });
        
        // Remove any existing forward scan and add new one at front
        this.queue = this.queue.filter(job => job.type !== 'forward');
        this.queue.unshift({
          type: 'forward',
          startTime: lastEndTime,
          endTime: now
        });
        
        this.processQueue();
      }
    }, intervalMs);
  }

  private enqueueInitialBackwardScan(): void {
    const startTime = moment(this.data.startTime);
    // KEXP API only provides data for the last 365 days
    const stopDate = config.historicalScanStopDate ? moment(config.historicalScanStopDate) : moment().subtract(365, 'days');
    
    logger.debug('Checking for initial backward scan', {
      currentStartTime: startTime.toISOString(),
      stopDate: stopDate.toISOString(),
      needsBackwardScan: startTime.isAfter(stopDate)
    });
    
    if (startTime.isAfter(stopDate)) {
      const backwardEnd = moment.max(startTime.clone().subtract(1, 'hour'), stopDate);
      
      this.queue.push({
        type: 'backward',
        startTime: backwardEnd,
        endTime: startTime
      });
      
      logger.debug('Queued initial backward scan', {
        from: backwardEnd.toISOString(),
        to: startTime.toISOString(),
        queueLength: this.queue.length
      });
    } else {
      logger.debug('No backward scan needed - already reached stop date');
      
      // Show message to user when progress bar is enabled
      if (process.argv.includes('--progress')) {
        const daysSinceStopDate = moment().diff(stopDate, 'days');
        console.log(`\n📊 Historical data limit reached (${stopDate.format('YYYY-MM-DD')})`);
        console.log(`   KEXP API only provides ${daysSinceStopDate} days of historical data`);
        console.log(`   No backward scans will be started\n`);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || !this.isRunning || this.queue.length === 0) {
      logger.debug('ProcessQueue skipped', {
        processing: this.processing,
        isRunning: this.isRunning,
        queueLength: this.queue.length
      });
      return;
    }

    this.processing = true;
    logger.debug('Processing queue started', { queueLength: this.queue.length });

    while (this.queue.length > 0 && this.isRunning) {
      const job = this.queue.shift()!;
      this.stateManager.setQueueLength(this.queue.length);
      
      logger.debug('Processing job from queue', {
        jobType: job.type,
        timeRange: `${job.startTime.format('YYYY-MM-DD HH:mm')} → ${job.endTime.format('YYYY-MM-DD HH:mm')}`,
        remainingInQueue: this.queue.length
      });
      
      try {
        await this.processJob(job);
      } catch (error) {
        const timeRange = `${job.startTime.format('YYYY-MM-DD HH:mm')} → ${job.endTime.format('YYYY-MM-DD HH:mm')}`;
        
        // Check if this is a data validation error
        if (error instanceof Error && error.message.includes('Data validation failed')) {
          logger.error('⚠️ CRITICAL: Data validation failed - scanner cannot save progress', {
            jobType: job.type,
            timeRange: timeRange,
            error: error.message,
            action: 'Scanner will continue but cannot save new double plays until schema is fixed',
            suggestion: 'Check if types package needs rebuilding or if schema needs updating for null values'
          });
          
          // Continue processing without crashing
          this.stateManager.resetRetryCount();
          continue;
        }
        
        // Check if this is an API health issue
        const healthStatus = this.api.getHealthStatus();
        if (!healthStatus.isHealthy) {
          // Only log after several retries to avoid breaking progress bar
          if (this.stateManager.getState().currentRetryCount > 3) {
            logger.warn('API request failed - will retry with exponential backoff', {
              jobType: job.type,
              timeRange: timeRange,
              retryCount: this.stateManager.getState().currentRetryCount,
              consecutiveFailures: healthStatus.consecutiveFailures,
              errorMessage: error instanceof Error ? error.message : error,
              willRetry: job.type === 'backward'
            });
          }
          
          // For backward scans, we can re-queue this job to try again later
          if (job.type === 'backward') {
            const retryDelayMs = 5000 + (healthStatus.consecutiveFailures * 2000); // Increase delay with failures
            // Only log at debug level to avoid console spam
            if (this.stateManager.getState().currentRetryCount <= 3) {
              logger.debug('Re-queueing backward scan job for retry', {
                retryDelaySeconds: retryDelayMs / 1000,
                timeRange: timeRange,
                retryCount: this.stateManager.getState().currentRetryCount
              });
            }
            
            // Add some delay and put job back at end of queue
            setTimeout(() => {
              if (this.isRunning) {
                this.queue.push(job);
                logger.debug('Backward scan job re-queued, resuming processing');
                this.processQueue(); // Resume processing
              }
            }, retryDelayMs);
          } else {
            logger.warn('Forward scan failed - will retry on next scheduled interval', {
              timeRange: timeRange
            });
          }
        } else {
          // Non-API error - log and continue with next job
          logger.error('Non-API error in scan job, continuing with next job', {
            jobType: job.type,
            timeRange: timeRange,
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      }
    }

    // Set idle when queue is empty
    if (this.isRunning) {
      this.stateManager.setScanIdle();
    }

    this.processing = false;
  }

  private async processJob(job: ScanJob): Promise<void> {
    const jobStartTime = Date.now();
    const requestCountBefore = this.api.getTotalRequests();
    
    // Validate job parameters
    if (!job.startTime || !job.endTime || !job.startTime.isValid() || !job.endTime.isValid()) {
      throw new Error(`Invalid job time parameters: start=${job.startTime?.toISOString()}, end=${job.endTime?.toISOString()}`);
    }

    if (job.startTime.isAfter(job.endTime)) {
      throw new Error(`Invalid time range: start time ${job.startTime.toISOString()} is after end time ${job.endTime.toISOString()}`);
    }

    logger.debug('Processing scan job', {
      type: job.type,
      from: job.startTime.toISOString(),
      to: job.endTime.toISOString()
    });

    // Update scanner state for progress monitor
    this.stateManager.updateScanJob(job.type, job.startTime, job.endTime);
    
    // Reset retry count when starting a new job
    this.stateManager.resetRetryCount();

    // Process one hour chunk only
    const chunkEnd = moment.min(
      job.startTime.clone().add(config.maxHoursPerRequest, 'hours'),
      job.endTime
    );

    // Validate chunk times before making API call
    if (!chunkEnd.isValid() || job.startTime.isAfter(chunkEnd)) {
      throw new Error(`Invalid chunk time range: start=${job.startTime.toISOString()}, chunkEnd=${chunkEnd.toISOString()}`);
    }

    logger.debug('Making API request for chunk', {
      type: job.type,
      chunkStart: job.startTime.toISOString(),
      chunkEnd: chunkEnd.toISOString(),
      chunkDurationHours: chunkEnd.diff(job.startTime, 'hours', true)
    });

    let plays: any[] = [];
    let newDoublePlays: any[] = [];
    
    try {
      plays = await this.api.getPlays(job.startTime, chunkEnd);
      this.stateManager.incrementRequests(); // Increment request counter
      this.stateManager.resetRetryCount(); // Reset retry count on successful request
      
      newDoublePlays = await this.detector.detectDoublePlays(plays);

      if (newDoublePlays.length > 0) {
        this.data.doublePlays.push(...newDoublePlays);
        this.data.doublePlays.sort((a, b) => new Date(a.plays[0].timestamp).getTime() - new Date(b.plays[0].timestamp).getTime());
        
        logger.info('Double play detected', {
          artist: newDoublePlays[0].artist,
          title: newDoublePlays[0].title,
          playCount: newDoublePlays[0].plays.length
        });
      }

      // Update data timestamps
      if (job.type === 'forward') {
        this.data.endTime = chunkEnd.toISOString();
      } else {
        this.data.startTime = job.startTime.toISOString();
      }

      // Use custom save handler if provided (includes backup triggers), otherwise fallback to direct storage
      if (this.saveData) {
        await this.saveData();
      } else {
        await this.storage.save(this.data);
      }
      
      // Report scan statistics
      const jobEndTime = Date.now();
      const scanDuration = jobEndTime - jobStartTime;
      const requestCount = this.api.getTotalRequests() - requestCountBefore;
      
      if (this.onScanComplete) {
        this.onScanComplete(job.type, scanDuration, requestCount);
      }
    } catch (error) {
      // Increment retry count instead of logging immediately
      this.stateManager.incrementRetryCount();
      
      // Only log after multiple retries
      if (this.stateManager.getState().currentRetryCount > 3) {
        logger.error('API request failed after multiple retries', {
          attempt: this.stateManager.getState().currentRetryCount,
          error: error instanceof Error ? error.message : error,
          jobType: job.type,
          startTime: job.startTime.toISOString(),
          endTime: chunkEnd.toISOString(),
          timeRange: `${job.startTime.format('YYYY-MM-DD HH:mm')} → ${chunkEnd.format('YYYY-MM-DD HH:mm')}`
        });
      }
      
      throw error; // Re-throw to trigger existing error handling
    }

    // If there's more work for this job, queue the next chunk
    if (chunkEnd.isBefore(job.endTime)) {
      const nextJob: ScanJob = {
        type: job.type,
        startTime: job.type === 'forward' ? chunkEnd : job.startTime.clone().subtract(config.maxHoursPerRequest, 'hours'),
        endTime: job.type === 'forward' ? job.endTime : job.startTime
      };

      if (job.type === 'backward') {
        // Only queue if no backward scan already queued
        const hasBackwardJob = this.queue.some(q => q.type === 'backward');
        if (!hasBackwardJob) {
          this.queue.push(nextJob);
        }
      } else {
        // Forward scans continue immediately
        this.queue.unshift(nextJob);
      }
    } else if (job.type === 'backward') {
      // Backward scan complete for this chunk, queue next historical chunk if needed
      this.enqueueNextBackwardScan();
    }

    logger.debug('Scan job completed', {
      type: job.type,
      playsScanned: plays.length,
      doublePlaysFound: newDoublePlays.length,
      queueLength: this.queue.length
    });
  }

  private enqueueNextBackwardScan(): void {
    const startTime = moment(this.data.startTime);
    // KEXP API only provides data for the last 365 days
    const stopDate = config.historicalScanStopDate ? moment(config.historicalScanStopDate) : moment().subtract(365, 'days');
    
    if (startTime.isAfter(stopDate)) {
      const backwardEnd = moment.max(startTime.clone().subtract(config.maxHoursPerRequest, 'hours'), stopDate);
      
      // Only queue if no backward scan already queued
      const hasBackwardJob = this.queue.some(q => q.type === 'backward');
      if (!hasBackwardJob) {
        this.queue.push({
          type: 'backward',
          startTime: backwardEnd,
          endTime: startTime
        });
        
        logger.debug('Queued next backward scan', {
          from: backwardEnd.toISOString(),
          to: startTime.toISOString()
        });
      }
    } else {
      logger.info('Backward scan complete - reached historical scan stop date');
      
      // Show message to user when progress bar is enabled
      if (process.argv.includes('--progress')) {
        const daysSinceStopDate = moment().diff(stopDate, 'days');
        console.log(`\n✅ Historical scanning complete!`);
        console.log(`   Reached KEXP API data limit (${stopDate.format('YYYY-MM-DD')})`);
        console.log(`   Scanned ${daysSinceStopDate} days of historical data`);
        console.log(`   Continuing with forward scans only...\n`);
      }
    }
  }

  // Method to access scanning state for health monitoring
  getScannerState() {
    return this.stateManager.getState();
  }
}