#!/usr/bin/env node

import { Scanner } from './scanner';
import logger from './logger';

async function main() {
  logger.info('KEXP Double Play Scanner starting', {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    logLevel: process.env.LOG_LEVEL || 'info'
  });
  
  const scanner = new Scanner();
  
  try {
    await scanner.initialize();
    
    const gracefulShutdown = (signal: string) => {
      logger.info('Graceful shutdown initiated', { signal });
      scanner.stop();
      // Give a moment for connections to close
      setTimeout(() => {
        logger.info('Process exiting');
        process.exit(0);
      }, 1000);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
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