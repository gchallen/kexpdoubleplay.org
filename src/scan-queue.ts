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

  constructor(api: KEXPApi, detector: DoublePlayDetector, storage: Storage, data: DoublePlayData) {
    this.api = api;
    this.detector = detector;
    this.storage = storage;
    this.data = data;
    this.stateManager = new ScannerStateManager();
    this.progressMonitor = new ProgressMonitor(data, this.stateManager);
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
    
    this.forwardScanTimer = setInterval(() => {
      if (!this.isRunning) return;
      
      const now = moment();
      const lastEndTime = moment(this.data.endTime);
      
      if (lastEndTime.isBefore(now)) {
        logger.debug('Adding forward scan job', {
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
    const stopDate = config.historicalScanStopDate ? moment(config.historicalScanStopDate) : moment().subtract(365, 'days');
    
    if (startTime.isAfter(stopDate)) {
      const backwardEnd = moment.max(startTime.clone().subtract(1, 'hour'), stopDate);
      
      this.queue.push({
        type: 'backward',
        startTime: backwardEnd,
        endTime: startTime
      });
      
      logger.debug('Queued initial backward scan', {
        from: backwardEnd.toISOString(),
        to: startTime.toISOString()
      });
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || !this.isRunning || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.isRunning) {
      const job = this.queue.shift()!;
      this.stateManager.setQueueLength(this.queue.length);
      
      try {
        await this.processJob(job);
      } catch (error) {
        logger.error('Error processing scan job', {
          jobType: job.type,
          error: error instanceof Error ? error.message : error
        });
      }
    }

    // Set idle when queue is empty
    if (this.isRunning) {
      this.stateManager.setScanIdle();
    }

    this.processing = false;
  }

  private async processJob(job: ScanJob): Promise<void> {
    logger.debug('Processing scan job', {
      type: job.type,
      from: job.startTime.toISOString(),
      to: job.endTime.toISOString()
    });

    // Update scanner state for progress monitor
    this.stateManager.updateScanJob(job.type, job.startTime, job.endTime);

    // Process one hour chunk only
    const chunkEnd = moment.min(
      job.startTime.clone().add(config.maxHoursPerRequest, 'hours'),
      job.endTime
    );

    const plays = await this.api.getPlays(job.startTime, chunkEnd);
    this.stateManager.incrementRequests(); // Increment request counter
    const newDoublePlays = await this.detector.detectDoublePlays(plays);

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

    await this.storage.save(this.data);

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
    }
  }
}