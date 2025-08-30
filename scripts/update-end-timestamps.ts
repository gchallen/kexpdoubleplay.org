#!/usr/bin/env bun

import * as fs from 'fs';
import { KEXPApi } from '../src/api';
import { DoublePlayData, DoublePlay } from '../src/types';
import moment from 'moment';

const DATA_FILE = 'double-plays.json';

async function updateEndTimestamps() {
  console.log('Loading existing double plays data...');
  const data: DoublePlayData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  
  const api = new KEXPApi();
  const updatedDoublePlays: DoublePlay[] = [];
  
  console.log(`Processing ${data.doublePlays.length} double plays...`);
  
  for (let i = 0; i < data.doublePlays.length; i++) {
    const doublePlay = data.doublePlays[i];
    console.log(`\n[${i + 1}/${data.doublePlays.length}] Processing: ${doublePlay.artist} - "${doublePlay.title}"`);
    
    try {
      // Get a date range that includes all plays for this double play
      const firstPlayTime = moment(doublePlay.plays[0].timestamp);
      const lastPlayTime = moment(doublePlay.plays[doublePlay.plays.length - 1].timestamp);
      
      // Extend the range a bit to ensure we catch the next item after the last play
      const startTime = firstPlayTime.clone().subtract(5, 'minutes');
      const endTime = lastPlayTime.clone().add(30, 'minutes'); // Songs are typically < 10 minutes
      
      console.log(`  Fetching plays from ${startTime.format()} to ${endTime.format()}...`);
      
      // Fetch plays for this time range (all play types)
      const plays = await api.getAllPlays(startTime, endTime);
      
      console.log(`  Found ${plays.length} total plays in time range`);
      
      // Sort plays by timestamp
      const sortedPlays = plays.sort((a, b) => 
        new Date(a.airdate).getTime() - new Date(b.airdate).getTime()
      );
      
      // Update each play in the double play with end timestamp
      const updatedPlays = doublePlay.plays.map(play => {
        // Find this exact play in the sorted list
        const foundPlay = sortedPlays.find(p => p.play_id === play.play_id);
        if (!foundPlay) {
          console.log(`  Warning: Could not find play ${play.play_id} in API results`);
          return play; // Return unchanged if not found
        }
        
        // Find the next item after this play
        const playIndex = sortedPlays.indexOf(foundPlay);
        let endTimestamp: string | undefined;
        
        if (playIndex < sortedPlays.length - 1) {
          endTimestamp = sortedPlays[playIndex + 1].airdate;
          const duration = moment(endTimestamp).diff(moment(foundPlay.airdate), 'seconds');
          console.log(`    Play ${play.play_id}: ${moment(foundPlay.airdate).format('HH:mm:ss')} -> ${moment(endTimestamp).format('HH:mm:ss')} (${duration}s)`);
        } else {
          console.log(`    Play ${play.play_id}: ${moment(foundPlay.airdate).format('HH:mm:ss')} -> [no end found]`);
        }
        
        return {
          timestamp: play.timestamp,
          end_timestamp: endTimestamp,
          play_id: play.play_id
        };
      });
      
      updatedDoublePlays.push({
        ...doublePlay,
        plays: updatedPlays
      });
      
      // Rate limiting - wait 1 second between API calls
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`  Error processing ${doublePlay.artist} - "${doublePlay.title}":`, error);
      // Keep the original if we can't update it
      updatedDoublePlays.push(doublePlay);
    }
  }
  
  // Copy over any remaining double plays that weren't processed
  for (let i = updatedDoublePlays.length; i < data.doublePlays.length; i++) {
    updatedDoublePlays.push(data.doublePlays[i]);
  }
  
  // Save updated data
  const updatedData: DoublePlayData = {
    ...data,
    doublePlays: updatedDoublePlays
  };
  
  console.log(`\nSaving updated data to ${DATA_FILE}...`);
  fs.writeFileSync(DATA_FILE, JSON.stringify(updatedData, null, 2), 'utf-8');
  
  // Print summary
  const playsWithEndTimestamp = updatedDoublePlays.reduce((count, dp) => 
    count + dp.plays.filter(p => p.end_timestamp).length, 0
  );
  const totalPlays = updatedDoublePlays.reduce((count, dp) => count + dp.plays.length, 0);
  
  console.log(`\nCompleted! Updated ${playsWithEndTimestamp}/${totalPlays} plays with end timestamps.`);
}

updateEndTimestamps().catch(console.error);