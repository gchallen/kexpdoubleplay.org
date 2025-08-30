#!/usr/bin/env node

import { Scanner } from './scanner';

async function main() {
  console.log('KEXP Double Play Scanner');
  console.log('========================');
  
  const scanner = new Scanner();
  
  try {
    await scanner.initialize();
    
    process.on('SIGINT', () => {
      console.log('\nShutting down gracefully...');
      scanner.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('\nShutting down gracefully...');
      scanner.stop();
      process.exit(0);
    });
    
    await scanner.start();
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main().catch(console.error);