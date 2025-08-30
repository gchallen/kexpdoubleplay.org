#!/usr/bin/env bun

import * as fs from 'fs';
import { DoublePlay } from '../src/types';

// Read current data
const data = JSON.parse(fs.readFileSync('double-plays.json', 'utf-8'));

function calculateDurationAndClassification(plays: Array<{timestamp: string; end_timestamp?: string; play_id: number}>): {duration?: number; classification?: 'legitimate' | 'partial' | 'mistake'} {
  if (plays.length < 2) {
    return {};
  }

  // Calculate total duration from first play start to last play end
  const firstStart = new Date(plays[0].timestamp).getTime();
  const lastPlay = plays[plays.length - 1];
  let totalDuration: number | undefined;

  if (lastPlay.end_timestamp) {
    const lastEnd = new Date(lastPlay.end_timestamp).getTime();
    totalDuration = Math.round((lastEnd - firstStart) / 1000);
  }

  // Calculate time between first two plays for fallback classification
  const time1 = new Date(plays[0].timestamp).getTime();
  const time2 = new Date(plays[1].timestamp).getTime();
  const timeBetweenSeconds = Math.round((time2 - time1) / 1000);

  // Calculate individual song durations if end timestamps are available
  const hasEndTimestamps = plays.every(play => play.end_timestamp);
  let classification: 'legitimate' | 'partial' | 'mistake';

  if (hasEndTimestamps) {
    // With end timestamps, we can be more precise
    const songDurations: number[] = [];
    for (const play of plays) {
      const startTime = new Date(play.timestamp).getTime();
      const endTime = new Date(play.end_timestamp!).getTime();
      const durationSeconds = Math.round((endTime - startTime) / 1000);
      songDurations.push(durationSeconds);
    }

    const firstDuration = songDurations[0];
    const secondDuration = songDurations[1];

    if (firstDuration < 30) {
      // Very short first play - likely a mistake
      classification = 'mistake';
    } else if (firstDuration < 90) {
      // Short first play - likely partial
      classification = 'partial';
    } else if (Math.abs(firstDuration - secondDuration) > 60 && secondDuration < 90) {
      // Big difference in durations, second is short
      classification = 'partial';
    } else if (firstDuration >= 90 && secondDuration >= 90) {
      // Both plays are reasonably long
      classification = 'legitimate';
    } else {
      // Edge cases
      classification = 'partial';
    }
  } else {
    // Fall back to old logic without end timestamps
    if (timeBetweenSeconds < 30) {
      classification = 'mistake';
    } else if (timeBetweenSeconds < 60) {
      classification = 'partial';
    } else {
      classification = 'legitimate';
    }
  }

  return {
    duration: totalDuration,
    classification: classification
  };
}

// Update each double play with duration and classification
let updated = 0;
for (const doublePlay of data.doublePlays) {
  const analysis = calculateDurationAndClassification(doublePlay.plays);
  
  if (analysis.duration !== undefined) {
    doublePlay.duration = analysis.duration;
  }
  if (analysis.classification !== undefined) {
    doublePlay.classification = analysis.classification;
  }
  
  updated++;
}

// Write back to file
fs.writeFileSync('double-plays.json', JSON.stringify(data, null, 2));

console.log(`✅ Updated ${updated} double-play entries with duration and classification data`);

// Show summary
const classifications = { legitimate: 0, partial: 0, mistake: 0 };
const withDuration = data.doublePlays.filter((dp: DoublePlay) => dp.duration !== undefined).length;

for (const dp of data.doublePlays) {
  if (dp.classification) {
    classifications[dp.classification]++;
  }
}

console.log(`\nSummary:`);
console.log(`  Entries with duration: ${withDuration}/${data.doublePlays.length}`);
console.log(`  Legitimate: ${classifications.legitimate}`);
console.log(`  Partial: ${classifications.partial}`);
console.log(`  Mistakes: ${classifications.mistake}`);