import moment from 'moment';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { DoublePlayData } from './types';
import { ScannerStateManager } from './scanner-state';
import { config } from './config';
import logger from './logger';

export class ProgressMonitor {
  private progressBar?: cliProgress.SingleBar;
  private updateTimer?: NodeJS.Timeout;
  private isRunning = false;
  private currentChunkStart?: moment.Moment;
  private currentChunkEnd?: moment.Moment;
  private chunkFixed = false; // Track if current chunk boundaries are set
  private currentChunkType?: 'forward' | 'backward'; // Track chunk type
  private lastScanType?: 'forward' | 'backward' | 'idle'; // Track scan type changes

  constructor(private data: DoublePlayData, private stateManager: ScannerStateManager) {}

  start(): void {
    if (!process.argv.includes('--progress')) {
      return; // Only show progress if --progress flag is set
    }

    this.isRunning = true;
    this.initializeProgressBar();
    this.startCurrentChunk();
    this.scheduleUpdates();
  }

  stop(): void {
    this.isRunning = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
    this.cleanupProgressBar();
  }

  // incrementRequests is now handled by ScannerStateManager

  private initializeProgressBar(): void {
    this.progressBar = new cliProgress.SingleBar({
      format: `   {bar} {percentage}% | {action} | {timeRange} | {requests} requests | {eta_formatted} ETA`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: false
    }, cliProgress.Presets.shades_classic);

    this.progressBar.start(100, 0, {
      action: 'Initializing...',
      timeRange: '',
      requests: 0
    });
  }

  private startCurrentChunk(): void {
    // Initial chunk setup - will be updated by updateCurrentChunk() based on scanner state
    const currentStart = moment(this.data.startTime);
    const currentEnd = moment(this.data.endTime);
    const stopDate = config.historicalScanStopDate ? moment(config.historicalScanStopDate) : moment().subtract(365, 'days');
    const now = moment();

    if (currentEnd.isBefore(now)) {
      // Forward scanning likely
      this.currentChunkStart = currentEnd;
      this.currentChunkEnd = moment.min(now, currentEnd.clone().add(7, 'days'));
    } else if (currentStart.isAfter(stopDate)) {
      // Backward scanning likely
      this.currentChunkEnd = currentStart;
      this.currentChunkStart = moment.max(stopDate, currentStart.clone().subtract(7, 'days'));
    }
  }

  private scheduleUpdates(): void {
    this.updateTimer = setInterval(() => {
      if (!this.isRunning || !this.progressBar) return;
      
      this.updateCurrentChunk();
      this.updateProgressBar();
    }, 1000); // Update every second
  }

  private updateCurrentChunk(): void {
    const scannerState = this.stateManager.getState();
    const currentStart = moment(this.data.startTime);

    // If we have a fixed backward chunk, only check if it's completed
    if (this.chunkFixed && this.currentChunkType === 'backward' && this.currentChunkStart && this.currentChunkEnd) {
      // Check if we've completed this historical chunk (scanned past the start boundary)
      if (currentStart.isSameOrBefore(this.currentChunkStart)) {
        // Historical chunk completed, start new one
        this.startNewHistoricalChunk();
        return;
      }
      // Otherwise, keep boundaries completely fixed
      return;
    }

    // If no chunk is set, or we're switching scan types, initialize appropriate chunk
    if (!this.chunkFixed) {
      if (scannerState.currentScanType === 'backward') {
        this.startNewHistoricalChunk();
      }
      // Note: Forward scans don't get chunks - they just update real-time
    }
  }

  private startNewHistoricalChunk(): void {
    const currentStart = moment(this.data.startTime);
    const stopDate = config.historicalScanStopDate ? moment(config.historicalScanStopDate) : moment().subtract(365, 'days');
    
    // Set fixed 7-day chunk boundaries going backward
    this.currentChunkEnd = currentStart.clone(); // Clone to avoid mutation
    this.currentChunkStart = moment.max(stopDate, currentStart.clone().subtract(7, 'days'));
    this.currentChunkType = 'backward';
    this.chunkFixed = true;
    
    // Reset backward request counter for new chunk
    this.stateManager.resetBackwardRequests();
    
    // Create new progress bar for this chunk
    this.createNewProgressBar();
    
    console.log(`\n📅 New historical chunk: ${this.currentChunkStart.format('MMM DD HH:mm')} → ${this.currentChunkEnd.format('MMM DD HH:mm')}`);
  }

  private cleanupProgressBar(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = undefined;
    }
  }

  private createNewProgressBar(): void {
    // Clean up old progress bar
    this.cleanupProgressBar();
    
    // Create new progress bar
    this.initializeProgressBar();
  }

  private updateProgressBar(): void {
    if (!this.progressBar) return;
    
    const scannerState = this.stateManager.getState();
    let progressValue = 0;
    let timeRange = '';
    let action = 'Idle';

    if (scannerState.currentScanType === 'forward') {
      // Forward scan: show 100% progress with current time range
      action = 'Forward scan';
      const currentEnd = moment(this.data.endTime);
      const now = moment();
      timeRange = `${currentEnd.format('MMM DD HH:mm')} → ${now.format('HH:mm')}`;
      progressValue = 100;
      
    } else if (scannerState.currentScanType === 'backward' && this.currentChunkStart && this.currentChunkEnd) {
      // Backward scan: show chunk progress
      action = 'Historical scan';
      const chunkStartTime = this.currentChunkStart.format('MMM DD HH:mm');
      const chunkEndTime = this.currentChunkEnd.format('MMM DD HH:mm');
      timeRange = `${chunkStartTime} → ${chunkEndTime}`;
      
      const chunkTotalHours = this.currentChunkEnd.diff(this.currentChunkStart, 'hours');
      const completedHours = Math.max(0, this.currentChunkEnd.diff(moment(this.data.startTime), 'hours'));
      progressValue = chunkTotalHours > 0 ? Math.min((completedHours / chunkTotalHours) * 100, 100) : 0;
      
    } else if (scannerState.currentScanType === 'idle') {
      action = `Idle (${scannerState.queueLength} queued)`;
      timeRange = 'Waiting for next scan...';
      progressValue = 0;
    } else {
      action = 'Complete';
      timeRange = 'Scan complete';
      progressValue = 100;
    }

    // Use appropriate counter based on scan type
    const requestCount = scannerState.currentScanType === 'forward' 
      ? scannerState.forwardRequests 
      : scannerState.backwardRequests;

    this.progressBar.update(progressValue, {
      action: action,
      timeRange: timeRange,
      requests: requestCount
    });
  }
}