import express from 'express';
import moment from 'moment';
import * as os from 'os';
import { Storage } from './storage';
import { config } from './config';
import { DoublePlayData } from './types';
import { KEXPApi } from './api';
import { ScanQueue } from './scan-queue';
import logger from './logger';

export class ApiServer {
  private app: express.Application;
  private server: any;
  private storage: Storage;
  private scannerStartTime: Date;
  private lastScanTime: Date | null = null;
  private scannerStatus: 'starting' | 'running' | 'stopped' | 'error' = 'starting';
  private lastError: string | null = null;

  constructor(private port: number = 3000, private api?: KEXPApi, private scanQueue?: ScanQueue) {
    this.app = express();
    this.storage = new Storage(config.dataFilePath);
    this.scannerStartTime = new Date();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Basic CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug('HTTP request', {
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/api/health', async (req, res) => {
      try {
        const data = await this.storage.load();
        const uptime = Date.now() - this.scannerStartTime.getTime();
        
        // Get KEXP API health status
        const apiHealthStatus = this.api?.getHealthStatus() || {
          isHealthy: true,
          consecutiveFailures: 0,
          lastFailureTime: null
        };
        
        // Determine retrieval status based on API health and scanner status
        let retrievalStatus = 'running';
        if (this.scannerStatus === 'error' || !apiHealthStatus.isHealthy) {
          retrievalStatus = 'stopped';
        } else if (this.scannerStatus === 'stopped') {
          retrievalStatus = 'stopped';
        }
        
        // Get system information
        const memoryUsage = process.memoryUsage();
        const totalScanDays = moment(data.endTime).diff(moment(data.startTime), 'days');
        const avgDoublePlaysPerDay = totalScanDays > 0 ? (data.doublePlays.length / totalScanDays).toFixed(2) : '0.00';
        
        // Get scanning progress data if available
        let scanningProgress = null;
        if (this.scanQueue) {
          const scannerState = this.scanQueue.getScannerState();
          const stopDate = config.historicalScanStopDate ? moment(config.historicalScanStopDate) : moment().subtract(365, 'days');
          
          let progressPercentage = 0;
          let currentChunkStart = null;
          let currentChunkEnd = null;
          
          if (scannerState.currentScanType === 'backward' && scannerState.currentScanStart && scannerState.currentScanEnd) {
            // Calculate progress for current historical chunk
            const chunkStartTime = scannerState.currentScanStart;
            const chunkEndTime = scannerState.currentScanEnd;
            const currentStartTime = moment(data.startTime);
            
            const chunkTotalHours = chunkEndTime.diff(chunkStartTime, 'hours');
            const completedHours = Math.max(0, chunkEndTime.diff(currentStartTime, 'hours'));
            progressPercentage = chunkTotalHours > 0 ? Math.min((completedHours / chunkTotalHours) * 100, 100) : 0;
            
            currentChunkStart = chunkStartTime.toISOString();
            currentChunkEnd = chunkEndTime.toISOString();
          } else if (scannerState.currentScanType === 'forward') {
            // Forward scans show 100% progress
            progressPercentage = 100;
            const currentEnd = moment(data.endTime);
            const now = moment();
            currentChunkStart = currentEnd.toISOString();
            currentChunkEnd = now.toISOString();
          }
          
          scanningProgress = {
            currentScanType: scannerState.currentScanType,
            currentChunkStart: currentChunkStart,
            currentChunkEnd: currentChunkEnd,
            progressPercentage: Math.round(progressPercentage * 100) / 100,
            queueLength: scannerState.queueLength,
            requests: {
              total: scannerState.totalRequests,
              forward: scannerState.forwardRequests,
              backward: scannerState.backwardRequests
            },
            currentRetryCount: scannerState.currentRetryCount,
            isRunning: scannerState.isRunning,
            historicalScanStopDate: config.historicalScanStopDate
          };
        }
        
        const health = {
          status: this.scannerStatus,
          uptime: Math.floor(uptime / 1000), // seconds
          startTime: this.scannerStartTime.toISOString(),
          lastScanTime: this.lastScanTime?.toISOString() || null,
          lastError: this.lastError,
          retrievalStatus,
          scanner: {
            earliestScanDate: data.startTime,
            latestScanDate: data.endTime,
            totalDoublePlays: data.doublePlays.length,
            scanDuration: totalScanDays,
            avgDoublePlaysPerDay: parseFloat(avgDoublePlaysPerDay),
            dataFileExists: true
          },
          scanningProgress: scanningProgress,
          kexpApi: {
            isHealthy: apiHealthStatus.isHealthy,
            consecutiveFailures: apiHealthStatus.consecutiveFailures,
            lastFailureTime: apiHealthStatus.lastFailureTime ? new Date(apiHealthStatus.lastFailureTime).toISOString() : null
          },
          system: {
            nodeVersion: process.version,
            platform: process.platform,
            architecture: process.arch,
            memoryUsage: {
              rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
              heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
              heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
              external: Math.round(memoryUsage.external / 1024 / 1024) // MB
            },
            loadAverage: process.platform !== 'win32' ? os.loadavg() : null,
            cpuCount: os.cpus().length
          },
          api: {
            version: '1.0.0',
            timestamp: new Date().toISOString()
          }
        };

        const statusCode = this.scannerStatus === 'error' ? 503 : 200;
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(500).json({
          status: 'error',
          error: 'Failed to load scanner data',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get all double plays data
    this.app.get('/api/double-plays', async (req, res) => {
      try {
        const data = await this.storage.load();
        
        // Get KEXP API health status
        const apiHealthStatus = this.api?.getHealthStatus() || {
          isHealthy: true,
          consecutiveFailures: 0,
          lastFailureTime: null
        };
        
        // Determine retrieval status
        let retrievalStatus = 'running';
        if (this.scannerStatus === 'error' || !apiHealthStatus.isHealthy) {
          retrievalStatus = 'stopped';
        } else if (this.scannerStatus === 'stopped') {
          retrievalStatus = 'stopped';
        }
        
        res.json({
          startTime: data.startTime,
          endTime: data.endTime,
          totalCount: data.doublePlays.length,
          retrievalStatus,
          doublePlays: data.doublePlays,
          metadata: {
            generatedAt: new Date().toISOString(),
            retrievalStatus,
            kexpApiHealth: {
              isHealthy: apiHealthStatus.isHealthy,
              consecutiveFailures: apiHealthStatus.consecutiveFailures
            },
            timeRange: {
              earliest: data.startTime,
              latest: data.endTime,
              durationDays: moment(data.endTime).diff(moment(data.startTime), 'days')
            }
          }
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load double plays data',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get double plays with pagination
    this.app.get('/api/double-plays/paginated', async (req, res) => {
      try {
        const data = await this.storage.load();
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 10, 100); // Max 100
        const offset = (page - 1) * limit;

        const paginatedPlays = data.doublePlays.slice(offset, offset + limit);
        const totalPages = Math.ceil(data.doublePlays.length / limit);

        res.json({
          page,
          limit,
          totalCount: data.doublePlays.length,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
          doublePlays: paginatedPlays,
          timeRange: {
            earliest: data.startTime,
            latest: data.endTime
          }
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load double plays data',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get statistics
    this.app.get('/api/stats', async (req, res) => {
      try {
        const data = await this.storage.load();
        
        // Calculate statistics
        const artistCounts: { [key: string]: number } = {};
        const djCounts: { [key: string]: number } = {};
        const showCounts: { [key: string]: number } = {};
        const playCountDistribution: { [key: number]: number } = {};

        data.doublePlays.forEach(dp => {
          // Artist stats
          artistCounts[dp.artist] = (artistCounts[dp.artist] || 0) + 1;
          
          // DJ stats
          if (dp.dj) {
            djCounts[dp.dj] = (djCounts[dp.dj] || 0) + 1;
          }
          
          // Show stats  
          if (dp.show) {
            showCounts[dp.show] = (showCounts[dp.show] || 0) + 1;
          }

          // Play count distribution
          const playCount = dp.plays.length;
          playCountDistribution[playCount] = (playCountDistribution[playCount] || 0) + 1;
        });

        // Get top entries
        const topArtists = Object.entries(artistCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10);
        
        const topDJs = Object.entries(djCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5);

        const topShows = Object.entries(showCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5);

        res.json({
          summary: {
            totalDoublePlays: data.doublePlays.length,
            uniqueArtists: Object.keys(artistCounts).length,
            uniqueDJs: Object.keys(djCounts).length,
            uniqueShows: Object.keys(showCounts).length,
            timespan: {
              start: data.startTime,
              end: data.endTime,
              days: moment(data.endTime).diff(moment(data.startTime), 'days')
            }
          },
          topArtists: topArtists.map(([artist, count]) => ({ artist, count })),
          topDJs: topDJs.map(([dj, count]) => ({ dj, count })),
          topShows: topShows.map(([show, count]) => ({ show, count })),
          playCountDistribution,
          generatedAt: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to generate statistics',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'KEXP Double Play Scanner API',
        version: '1.0.0',
        description: 'REST API for KEXP double play data and scanner health',
        endpoints: {
          '/api/health': 'Scanner health and status information',
          '/api/double-plays': 'All double plays data',
          '/api/double-plays/paginated': 'Paginated double plays (query: ?page=1&limit=10)',
          '/api/stats': 'Statistics about double plays'
        },
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: ['/api', '/api/health', '/api/double-plays', '/api/double-plays/paginated', '/api/stats']
      });
    });
  }

  // Methods to update scanner status and set scan queue
  updateScannerStatus(status: 'running' | 'stopped' | 'error', error?: string): void {
    this.scannerStatus = status;
    this.lastScanTime = new Date();
    this.lastError = error || null;
  }

  setScanQueue(scanQueue: ScanQueue): void {
    this.scanQueue = scanQueue;
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info('API Server started', {
          port: this.port,
          healthEndpoint: `http://localhost:${this.port}/api/health`,
          docsEndpoint: `http://localhost:${this.port}/api`
        });
        this.scannerStatus = 'running';
        resolve();
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      logger.info('API Server stopped');
    }
  }
}