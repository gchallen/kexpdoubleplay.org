#!/usr/bin/env node

import moment from 'moment-timezone';
import { KEXPApi } from './api';
import { DoublePlayDetector } from './detector';

async function verifySpikeIsland() {
  console.log('Verifying Spike Island - Pulp double play on April 10, 2025...\n');
  
  const api = new KEXPApi();
  const detector = new DoublePlayDetector();
  
  const centralTime = moment.tz('2025-04-10 10:08', 'YYYY-MM-DD HH:mm', 'America/Chicago');
  const startTime = centralTime.clone().subtract(30, 'minutes');
  const endTime = centralTime.clone().add(30, 'minutes');
  
  console.log(`Searching from ${startTime.format('YYYY-MM-DD HH:mm:ss Z')} to ${endTime.format('YYYY-MM-DD HH:mm:ss Z')}`);
  console.log(`(Central Time: ${startTime.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss')} to ${endTime.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss')})\n`);
  
  try {
    const plays = await api.getPlays(startTime, endTime);
    console.log(`Found ${plays.length} total plays\n`);
    
    const spikeIslandPlays = plays.filter(p => 
      p.artist?.toLowerCase().includes('spike island') ||
      p.song?.toLowerCase().includes('pulp')
    );
    
    if (spikeIslandPlays.length > 0) {
      console.log('Found Spike Island plays:');
      spikeIslandPlays.forEach(play => {
        const playTime = moment(play.airdate).tz('America/Chicago');
        console.log(`  - ${play.artist} - ${play.song} at ${playTime.format('YYYY-MM-DD HH:mm:ss')} Central`);
        if (play.host) {
          console.log(`    DJ: ${play.host.name}`);
        }
        if (play.show) {
          console.log(`    Show: ${play.show.name}`);
        }
      });
      
      const doublePlays = detector.detectDoublePlays(plays);
      const spikeIslandDouble = doublePlays.find(dp => 
        dp.artist.toLowerCase().includes('spike island') ||
        dp.title.toLowerCase().includes('pulp')
      );
      
      if (spikeIslandDouble) {
        console.log('\n✓ Double play confirmed!');
        console.log(`  Artist: ${spikeIslandDouble.artist}`);
        console.log(`  Title: ${spikeIslandDouble.title}`);
        console.log(`  Number of plays: ${spikeIslandDouble.plays.length}`);
        console.log(`  DJ: ${spikeIslandDouble.dj || 'Unknown'}`);
        console.log(`  Show: ${spikeIslandDouble.show || 'Unknown'}`);
      } else {
        console.log('\n⚠ Spike Island tracks found but not detected as double play');
      }
    } else {
      console.log('✗ No Spike Island - Pulp plays found in this time window');
      console.log('Note: The date might be in the future or the API might not have this data yet');
    }
    
  } catch (error) {
    console.error('Error verifying:', error);
  }
}

verifySpikeIsland().catch(console.error);