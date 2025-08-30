import moment from 'moment';
import { KEXPApi } from './api';
import { DoublePlayDetector } from './detector';
import { Storage } from './storage';
import { config } from './config';
import { DoublePlayData } from './types';
import { ApiServer } from './api-server';

export class Scanner {
  private api: KEXPApi;
  private detector: DoublePlayDetector;
  private storage: Storage;
  private data: DoublePlayData;
  private isRunning = false;
  private apiServer?: ApiServer;

  constructor() {
    this.api = new KEXPApi();
    this.detector = new DoublePlayDetector(this.api);
    this.storage = new Storage(config.dataFilePath);
    this.data = {
      startTime: moment().subtract(1, 'day').toISOString(),
      endTime: moment().toISOString(),
      doublePlays: []
    };
  }

  async initialize(): Promise<void> {
    this.data = await this.storage.load();
    console.log(`Loaded data - Start: ${this.data.startTime}, End: ${this.data.endTime}`);
    console.log(`Found ${this.data.doublePlays.length} existing double plays`);
    
    // Start API server
    const apiPort = parseInt(process.env.API_PORT || '3000', 10);
    this.apiServer = new ApiServer(apiPort, this.api);
    await this.apiServer.start();
  }

  async start(): Promise<void> {
    this.isRunning = true;
    
    try {
      this.apiServer?.updateScannerStatus('running');
      
      await this.scanForward();
      
      await this.scanBackward();
      
      this.schedulePeriodicScan();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Scanner error:', errorMessage);
      this.apiServer?.updateScannerStatus('error', errorMessage);
      throw error;
    }
  }

  stop(): void {
    this.isRunning = false;
    this.api.destroy(); // Cleanup HTTP connections
    this.apiServer?.updateScannerStatus('stopped');
    this.apiServer?.stop(); // Stop API server
  }

  private async scanForward(): Promise<void> {
    console.log('Starting forward scan from end time...');
    const endTime = moment(this.data.endTime);
    const now = moment();
    
    if (endTime.isBefore(now)) {
      await this.scanRange(endTime, now, 'forward');
      this.data.endTime = now.toISOString();
      await this.storage.save(this.data);
    }
  }

  private async scanBackward(): Promise<void> {
    console.log('Starting backward scan from start time...');
    const startTime = moment(this.data.startTime);
    const targetTime = moment(this.data.startTime).subtract(7, 'days');
    
    if (startTime.isAfter(targetTime)) {
      await this.scanRange(targetTime, startTime, 'backward');
      this.data.startTime = targetTime.toISOString();
      await this.storage.save(this.data);
    }
  }

  private async scanRange(
    startTime: moment.Moment, 
    endTime: moment.Moment, 
    direction: 'forward' | 'backward'
  ): Promise<void> {
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
    
    for (const chunk of chunks) {
      if (!this.isRunning) break;
      
      console.log(`Scanning ${chunk.start.format('YYYY-MM-DD HH:mm')} to ${chunk.end.format('YYYY-MM-DD HH:mm')}`);
      
      try {
        const plays = await this.api.getPlays(chunk.start, chunk.end);
        console.log(`Found ${plays.length} plays`);
        
        const newDoublePlays = await this.detector.detectDoublePlays(plays);
        if (newDoublePlays.length > 0) {
          console.log(`Detected ${newDoublePlays.length} double plays`);
          this.data.doublePlays = this.detector.mergeDoublePlays(
            this.data.doublePlays,
            newDoublePlays
          );
          await this.storage.save(this.data);
        }
        
        // Update last scan time
        this.apiServer?.updateScannerStatus('running');
      } catch (error) {
        console.error(`Error scanning chunk: ${error}`);
        
        // Check if this is an API health issue
        const healthStatus = this.api.getHealthStatus();
        if (!healthStatus.isHealthy) {
          this.apiServer?.updateScannerStatus('error', `KEXP API unavailable (${healthStatus.consecutiveFailures} consecutive failures)`);
          
          // If we have many failures, pause scanning for longer
          if (healthStatus.consecutiveFailures >= 3) {
            console.log(`Pausing scanning due to API failures. Will retry after backoff period.`);
            // Don't break the loop, let the backoff mechanism handle retries
          }
        }
      }
    }
  }

  private schedulePeriodicScan(): void {
    const intervalMs = config.scanIntervalMinutes * 60 * 1000;
    
    const periodicScan = async () => {
      if (!this.isRunning) return;
      
      console.log(`Running periodic scan at ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
      
      const now = moment();
      const lastEndTime = moment(this.data.endTime);
      
      if (lastEndTime.isBefore(now)) {
        try {
          await this.scanRange(lastEndTime, now, 'forward');
          this.data.endTime = now.toISOString();
          await this.storage.save(this.data);
        } catch (error) {
          console.error(`Error in periodic scan: ${error}`);
          
          // Check API health and update status accordingly
          const healthStatus = this.api.getHealthStatus();
          if (!healthStatus.isHealthy) {
            this.apiServer?.updateScannerStatus('error', `KEXP API unavailable during periodic scan`);
          }
        }
      }
      
      if (this.isRunning) {
        setTimeout(periodicScan, intervalMs);
      }
    };
    
    setTimeout(periodicScan, intervalMs);
    console.log(`Scheduled periodic scan every ${config.scanIntervalMinutes} minutes`);
  }
}