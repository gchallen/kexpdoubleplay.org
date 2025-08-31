#!/usr/bin/env node

// Load .env before any other imports to ensure environment variables are available
import 'dotenv/config';

import { Scanner } from './scanner';
import logger from './logger';
import * as fs from 'fs';
import { config } from './config';

async function main() {
  // Check for --restart flag
  if (process.argv.includes('--restart')) {
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
  
  // Show debug mode status
  const debugMode = process.argv.includes('--debug');
  if (debugMode) {
    console.log('🐛 Debug mode enabled - verbose logging active');
  }
  
  logger.info('KEXP Double Play Scanner starting', {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    logLevel: debugMode ? 'debug' : (process.env.LOG_LEVEL || 'info'),
    debugMode: debugMode
  });
  
  const scanner = new Scanner();
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