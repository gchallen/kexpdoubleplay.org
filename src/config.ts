import { Config } from './types';
import * as path from 'path';

export const config: Config = {
  dataFilePath: process.env.DATA_FILE_PATH || path.join(process.cwd(), 'double-plays.json'),
  apiBaseUrl: 'https://api.kexp.org/v2',
  rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || '1000', 10),
  scanIntervalMinutes: parseInt(process.env.SCAN_INTERVAL_MINUTES || '5', 10),
  maxHoursPerRequest: parseInt(process.env.MAX_HOURS_PER_REQUEST || '1', 10),
};