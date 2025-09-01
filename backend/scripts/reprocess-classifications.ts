#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'fs';
import { DoublePlayDetector } from './src/detector';
import logger from './src/logger';

interface StoredDoublePlay {
  artist: string;
  title: string;
  plays: Array<{
    timestamp: string;
    end_timestamp?: string;
    play_id: number;
    duration?: number;
    kexpPlay?: any;
  }>;
  dj?: string;
  show?: string;
  classification?: 'legitimate' | 'partial' | 'mistake';
}

interface StoredData {
  doublePlays: StoredDoublePlay[];
  lastScanned?: string;
  scanRangeStart?: string;
  scanRangeEnd?: string;
  startTime?: string;
  endTime?: string;
  counts?: {
    legitimate: number;
    partial: number;
    mistake: number;
  };
}

function main() {
  try {
    // Read the existing double-plays.json
    const jsonData = readFileSync('./double-plays.json', 'utf-8');
    const data: StoredData = JSON.parse(jsonData);
    
    logger.info('Loaded existing double plays', {
      count: data.doublePlays.length
    });
    
    // Create a detector instance for classification calculation
    const detector = new DoublePlayDetector();
    
    // Track changes
    let updatedCount = 0;
    const changes: Array<{artist: string, title: string, oldClass?: string, newClass: string}> = [];
    
    // Reprocess each double play
    for (const doublePlay of data.doublePlays) {
      // Calculate the new classification
      const newClassification = (detector as any).calculateClassification(doublePlay.plays);
      
      // Check if classification changed
      if (doublePlay.classification !== newClassification) {
        changes.push({
          artist: doublePlay.artist,
          title: doublePlay.title,
          oldClass: doublePlay.classification,
          newClass: newClassification
        });
        doublePlay.classification = newClassification;
        updatedCount++;
      }
    }
    
    // Calculate updated counts
    const counts = {
      legitimate: 0,
      partial: 0,
      mistake: 0
    };
    
    for (const dp of data.doublePlays) {
      if (dp.classification) {
        counts[dp.classification]++;
      }
    }
    
    // Update the counts in the data (include total field)
    if (data.counts) {
      data.counts = {
        ...counts,
        total: counts.legitimate + counts.partial + counts.mistake
      };
    }
    
    // Save the updated data
    writeFileSync('./double-plays.json', JSON.stringify(data, null, 2));
    
    // Report results
    logger.info('Reprocessing complete', {
      totalDoublePlays: data.doublePlays.length,
      updatedCount,
      unchanged: data.doublePlays.length - updatedCount
    });
    
    if (changes.length > 0) {
      logger.info('Classification changes:');
      for (const change of changes) {
        logger.info(`  ${change.artist} - "${change.title}": ${change.oldClass || 'unclassified'} → ${change.newClass}`);
      }
      
      logger.info('Updated classification totals:', counts);
    } else {
      logger.info('No classification changes needed');
    }
    
  } catch (error) {
    logger.error('Failed to reprocess classifications', {
      error: error instanceof Error ? error.message : error
    });
    process.exit(1);
  }
}

main();