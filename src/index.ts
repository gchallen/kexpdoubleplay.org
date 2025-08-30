#!/usr/bin/env node

import { Scanner } from './scanner';

async function main() {
  console.log('KEXP Double Play Scanner');
  console.log('========================');
  
  const scanner = new Scanner();
  
  try {
    await scanner.initialize();
    
    const gracefulShutdown = () => {
      console.log('\nShutting down gracefully...');
      scanner.stop();
      // Give a moment for connections to close
      setTimeout(() => process.exit(0), 1000);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    
    await scanner.start();
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main().catch(console.error);