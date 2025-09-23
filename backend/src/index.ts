#!/usr/bin/env bun

// Load .env before any other imports to ensure environment variables are available
import 'dotenv/config';

import { Command } from 'commander';
import { Scanner } from './scanner';
import logger from './logger';
import * as fs from 'fs';
import { config } from './config';
// CLI Options interface
export interface CLIOptions {
  restart: boolean;
  startDate: string; // YYYY-MM-DD format
  backwardScan: boolean;
  forceLocal: boolean;
  forceBackup: boolean;
  progress: boolean;
  debug: boolean;
  dryRun: boolean;
  port?: number;
}
import { version } from '../package.json';
import moment from 'moment';

// Create CLI interface
const program = new Command();

program
  .name('kexp-scanner')
  .description('KEXP Double Play Scanner - Detects and tracks double plays on KEXP radio')
  .version(version);

program
  .option('-r, --restart', 'Start fresh with a new data file (ignore existing data and backups)')
  .option('-s, --start <date>', 'Start date for backward scanning (YYYY-MM-DD format, default: 365 days ago)')
  .option('--backwardScan', 'Run backward scan to start date and exit (no continuous monitoring)')
  .option('--force-local', 'Force use of local data file only (ignore backups)')
  .option('--force-backup', 'Force use of backup data only (ignore local file)')
  .option('-p, --progress', 'Show progress bars during scanning')
  .option('--debug', 'Enable debug logging for troubleshooting')
  .option('--dry-run', 'Scan without saving results (useful for testing)')
  .option('--port <number>', 'API server port (default: 3000 or API_PORT env)', parseInt)
  .helpOption('-h, --help', 'Display help for command')
  .addHelpText('after', `
Examples:
  $ bun start                           # Normal operation with default settings
  $ bun start --restart                 # Fresh scan starting from 365 days ago
  $ bun start --start=2025-09-01        # Scan backward to September 1, 2025
  $ bun start --backwardScan --start=2025-09-22  # One-time scan to Sept 22, then exit
  $ bun start --debug                   # Run with debug logging enabled
  $ bun start --progress                # Show progress bars during scanning
  $ bun start --port=8080               # Run API server on port 8080

Environment Variables:
  API_PORT           API server port (default: 3000)
  DATA_FILE_PATH     Path to data file (default: ./double-plays.json)
  LOG_LEVEL          Winston log level (default: info)
  GITHUB_TOKEN       GitHub token for backup operations
  GITHUB_REPO_OWNER  GitHub repository owner for backups
  GITHUB_REPO_NAME   GitHub repository name for backups
`);

// Parse command line arguments
program.parse(process.argv);
const options = program.opts();

// Parse and validate start date
let startDate: moment.Moment;
if (options.start) {
  startDate = moment(options.start, 'YYYY-MM-DD', true);
  if (!startDate.isValid()) {
    console.error('Error: --start must be in YYYY-MM-DD format (e.g., 2025-09-22)');
    process.exit(1);
  }
} else {
  // Default to 365 days ago
  startDate = moment().subtract(365, 'days');
}

// Build CLI options
const cliOptions: CLIOptions = {
  restart: options.restart || false,
  startDate: startDate.format('YYYY-MM-DD'),
  backwardScan: options.backwardScan || false,
  forceLocal: options.forceLocal || false,
  forceBackup: options.forceBackup || false,
  progress: options.progress || false,
  debug: options.debug || false,
  dryRun: options.dryRun || false,
  port: options.port
};

// Validate options
if (cliOptions.forceLocal && cliOptions.forceBackup) {
  console.error('Error: Cannot use both --force-local and --force-backup');
  process.exit(1);
}


// Configure logging based on debug flag
if (cliOptions.debug) {
  process.env.LOG_LEVEL = 'debug';
  logger.level = 'debug';
  console.log('🐛 Debug mode enabled - verbose logging active');
}

// Set API port if specified
if (cliOptions.port) {
  process.env.API_PORT = cliOptions.port.toString();
}

async function main() {
  // Handle restart mode
  if (cliOptions.restart) {
    console.log('🔄 Restart mode: Removing existing data file...');
    try {
      if (fs.existsSync(config.dataFilePath)) {
        fs.unlinkSync(config.dataFilePath);
        console.log(`✅ Removed ${config.dataFilePath}`);
      } else {
        console.log('ℹ️  No existing data file found');
      }
    } catch (error) {
      console.error('❌ Error removing data file:', error);
      process.exit(1);
    }
  }

  logger.info('KEXP Double Play Scanner starting', {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    logLevel: cliOptions.debug ? 'debug' : (process.env.LOG_LEVEL || 'info'),
    debugMode: cliOptions.debug,
    options: {
      startDate: cliOptions.startDate,
      backwardScan: cliOptions.backwardScan,
      restart: cliOptions.restart,
      dryRun: cliOptions.dryRun
    }
  });

  const scanner = new Scanner(cliOptions);
  let isShuttingDown = false;

  try {
    await scanner.initialize();

    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal', { signal });
        return;
      }
      isShuttingDown = true;

      logger.info('Graceful shutdown initiated', { signal });
      try {
        await scanner.stop();
        logger.info('Process exiting');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    // Use setImmediate to ensure async handling works properly
    process.on('SIGINT', () => {
      setImmediate(() => gracefulShutdown('SIGINT'));
    });
    process.on('SIGTERM', () => {
      setImmediate(() => gracefulShutdown('SIGTERM'));
    });

    await scanner.start();

  } catch (error) {
    logger.error('Fatal error occurred', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error in main', {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});