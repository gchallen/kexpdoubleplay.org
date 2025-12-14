import { Config } from '@kexp-doubleplay/types';
import * as path from 'path';

export const config: Config = {
  dataFilePath: process.env.DATA_FILE_PATH || path.join(process.cwd(), 'double-plays.json'),
  apiBaseUrl: 'https://api.kexp.org/v2',
  rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || '1000', 10),
  scanIntervalMinutes: parseFloat(process.env.SCAN_INTERVAL_MINUTES || '5'),
  maxHoursPerRequest: parseInt(process.env.MAX_HOURS_PER_REQUEST || '1', 10),
  apiPort: parseInt(process.env.API_PORT || '3000', 10),
  historicalScanStopDate: process.env.HISTORICAL_SCAN_STOP_DATE, // Optional: YYYY-MM-DD format, e.g., "2020-01-01"
  backupIntervalHours: parseFloat(process.env.BACKUP_INTERVAL_HOURS || '24') // Hours between backups (supports fractional, e.g., 0.5 = 30 min)
};