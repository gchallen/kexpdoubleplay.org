import moment from 'moment';

export interface ScannerState {
  currentScanType: 'forward' | 'backward' | 'idle';
  currentScanStart?: moment.Moment;
  currentScanEnd?: moment.Moment;
  totalRequests: number;
  forwardRequests: number;
  backwardRequests: number;
  isRunning: boolean;
  queueLength: number;
}

export class ScannerStateManager {
  private state: ScannerState = {
    currentScanType: 'idle',
    totalRequests: 0,
    forwardRequests: 0,
    backwardRequests: 0,
    isRunning: false,
    queueLength: 0
  };

  updateScanJob(type: 'forward' | 'backward', startTime: moment.Moment, endTime: moment.Moment): void {
    // Reset forward counter when starting a new forward scan
    if (type === 'forward') {
      this.state.forwardRequests = 0;
    }
    
    this.state.currentScanType = type;
    this.state.currentScanStart = startTime;
    this.state.currentScanEnd = endTime;
  }

  setScanIdle(): void {
    this.state.currentScanType = 'idle';
    this.state.currentScanStart = undefined;
    this.state.currentScanEnd = undefined;
  }

  incrementRequests(): void {
    this.state.totalRequests++;
    if (this.state.currentScanType === 'forward') {
      this.state.forwardRequests++;
    } else if (this.state.currentScanType === 'backward') {
      this.state.backwardRequests++;
    }
  }

  resetForwardRequests(): void {
    this.state.forwardRequests = 0;
  }

  resetBackwardRequests(): void {
    this.state.backwardRequests = 0;
  }

  setRunning(running: boolean): void {
    this.state.isRunning = running;
  }

  setQueueLength(length: number): void {
    this.state.queueLength = length;
  }

  getState(): ScannerState {
    return { ...this.state }; // Return copy to prevent external mutation
  }
}