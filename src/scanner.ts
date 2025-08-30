import moment from 'moment';
import { KEXPApi } from './api';
import { DoublePlayDetector } from './detector';
import { Storage } from './storage';
import { config } from './config';
import { DoublePlayData } from './types';

export class Scanner {
  private api: KEXPApi;
  private detector: DoublePlayDetector;
  private storage: Storage;
  private data: DoublePlayData;
  private isRunning = false;

  constructor() {
    this.api = new KEXPApi();
    this.detector = new DoublePlayDetector();
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
  }

  async start(): Promise<void> {
    this.isRunning = true;
    
    await this.scanForward();
    
    await this.scanBackward();
    
    this.schedulePeriodicScan();
  }

  stop(): void {
    this.isRunning = false;
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
        
        const newDoublePlays = this.detector.detectDoublePlays(plays);
        if (newDoublePlays.length > 0) {
          console.log(`Detected ${newDoublePlays.length} double plays`);
          this.data.doublePlays = this.detector.mergeDoublePlays(
            this.data.doublePlays,
            newDoublePlays
          );
          await this.storage.save(this.data);
        }
      } catch (error) {
        console.error(`Error scanning chunk: ${error}`);
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
        await this.scanRange(lastEndTime, now, 'forward');
        this.data.endTime = now.toISOString();
        await this.storage.save(this.data);
      }
      
      if (this.isRunning) {
        setTimeout(periodicScan, intervalMs);
      }
    };
    
    setTimeout(periodicScan, intervalMs);
    console.log(`Scheduled periodic scan every ${config.scanIntervalMinutes} minutes`);
  }
}