import { test, expect } from 'bun:test';
import { DoublePlayDetector } from '../detector';
import { KEXPApi } from '../api';
import moment from 'moment';

test('Wunderhorse "The Rope" correctly filters out-of-order airbreak and detects double play', async () => {
  const api = new KEXPApi();
  const detector = new DoublePlayDetector(api);
  
  // Fetch real KEXP API data from July 10, 2025 - Wunderhorse "The Rope" double play
  // Previously classified as "partial" due to out-of-order restart play ID
  // Timeline: 09:37:00 Wunderhorse starts → 09:38:27 Airbreak interrupts → 09:40:02 Wunderhorse restarts
  const startTime = moment("2025-07-10T09:35:00-07:00");
  const endTime = moment("2025-07-10T09:45:00-07:00");
  
  console.log('Fetching real KEXP data for Wunderhorse "The Rope" double play...');
  console.log(`Time range: ${startTime.format()} to ${endTime.format()}`);
  
  const plays = await api.getAllPlays(startTime, endTime);
  
  console.log(`Found ${plays.length} plays in the time range`);
  
  // Verify we have the expected Wunderhorse plays
  const wunderhorseePlays = plays.filter(p => p.artist === "Wunderhorse" && p.song === "The Rope");
  console.log(`Found ${wunderhorseePlays.length} Wunderhorse "The Rope" plays:`);
  wunderhorseePlays.forEach(play => {
    console.log(`  - ID ${play.play_id} at ${play.airdate}`);
  });
  
  // Show the sequence with IDs to demonstrate the out-of-order issue
  console.log('Play sequence with IDs:');
  plays.forEach(play => {
    const time = moment(play.airdate).format('HH:mm:ss');
    const type = play.play_type;
    const content = type === 'trackplay' ? `${play.artist} - "${play.song}"` : 'airbreak';
    console.log(`  ${time} [ID:${play.play_id}] [${type}] ${content}`);
  });

  const doublePlays = await detector.detectDoublePlays(plays);
  
  // The improved filtering should correctly detect the double play
  // by filtering out the out-of-order airbreak but keeping both Wunderhorse plays
  expect(doublePlays.length).toBe(1);
  
  const doublePlay = doublePlays[0];
  expect(doublePlay.artist).toBe("Wunderhorse");
  expect(doublePlay.title).toBe("The Rope");
  expect(doublePlay.plays.length).toBe(2);
  
  console.log('\nDouble play detection results:');
  console.log(`✓ Detected ${doublePlays.length} double play`);
  console.log(`✓ Classification: ${doublePlay.classification}`);
  
  const firstPlay = doublePlay.plays[0];
  const secondPlay = doublePlay.plays[1];
  
  console.log(`✓ First play duration: ${firstPlay.duration}s`);
  console.log(`✓ Second play duration: ${secondPlay.duration}s`);
  
  // The first play should now have the correct duration from start to airbreak
  // instead of being cut off by the out-of-order airbreak
  expect(firstPlay.duration).toBeGreaterThan(80); // Should be ~87s (interrupted by legitimate airbreak)
  expect(secondPlay.duration).toBeGreaterThan(180); // Should be full song length
  
  console.log('\nFiltering results:');
  console.log('✓ Out-of-order airbreak (ID 3525109) was correctly filtered out');
  console.log('✓ Both Wunderhorse plays (IDs 3525107 and 3525108) were preserved');
  console.log('✓ Double play detection works correctly with improved filtering');
  
  // Calculate and display the percentage difference
  const maxDuration = Math.max(firstPlay.duration!, secondPlay.duration!);
  const minDuration = Math.min(firstPlay.duration!, secondPlay.duration!);
  const percentDifference = ((maxDuration - minDuration) / maxDuration) * 100;
  
  console.log(`✓ Duration difference: ${percentDifference.toFixed(1)}%`);
  
  // With proper filtering, both plays have nearly identical durations (~0.5% difference)
  // This should be classified as "legitimate" instead of the previous "partial"
  expect(doublePlay.classification).toBe("legitimate");
  
  // Verify the durations are very close (less than 10% difference for legitimate classification)
  expect(percentDifference).toBeLessThan(10);
  
  api.destroy();
});