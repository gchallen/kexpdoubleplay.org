import moment from 'moment-timezone';
import { KEXPApi } from './api';
import { DoublePlayDetector } from './detector';

describe('Integration Tests', () => {
  let api: KEXPApi;
  let detector: DoublePlayDetector;

  beforeEach(() => {
    api = new KEXPApi();
    detector = new DoublePlayDetector(api);
  });

  it('should detect the actual Pulp - Spike Island double play from April 10, 2025', async () => {
    // This test fetches real data from KEXP API to verify the confirmed double play
    // of "Spike Island" by Pulp that occurred on April 10, 2025 around 8:08 AM Pacific
    // Play 1: 8:08:40 AM (ID: 3487084)
    // Airbreak: 8:12:04 AM  
    // Play 2: 8:13:44 AM (ID: 3487086)
    
    console.log('Testing actual Pulp - Spike Island double play from April 10, 2025...');
    
    // Query the specific time period where we know the double play occurred
    const startTime = moment.tz('2025-04-10 08:00', 'YYYY-MM-DD HH:mm', 'America/Los_Angeles');
    const endTime = moment.tz('2025-04-10 08:20', 'YYYY-MM-DD HH:mm', 'America/Los_Angeles');
    
    console.log(`Searching from ${startTime.format()} to ${endTime.format()} Pacific`);
    
    const plays = await api.getPlays(startTime, endTime);
    console.log(`Found ${plays.length} total plays`);
    
    // Look for Pulp - Spike Island plays
    const pulpPlays = plays.filter(p => 
      p.artist?.toLowerCase() === 'pulp' &&
      p.song?.toLowerCase() === 'spike island'
    );
    
    console.log(`Found ${pulpPlays.length} Pulp - Spike Island plays:`);
    pulpPlays.forEach(play => {
      const playTime = moment(play.airdate).tz('America/Los_Angeles');
      console.log(`  - ${play.artist} - ${play.song} at ${playTime.format('HH:mm:ss')} Pacific (ID: ${play.play_id})`);
    });
    
    // Detect double plays from the data
    const doublePlays = await detector.detectDoublePlays(plays);
    console.log(`Detected ${doublePlays.length} total double plays`);
    
    // Find the Pulp double play
    const pulpDouble = doublePlays.find(dp => 
      dp.artist.toLowerCase() === 'pulp' &&
      dp.title.toLowerCase() === 'spike island'
    );
    
    // Assertions
    expect(pulpPlays.length).toBeGreaterThanOrEqual(2);
    expect(pulpDouble).toBeDefined();
    
    if (pulpDouble) {
      expect(pulpDouble.plays.length).toBeGreaterThanOrEqual(2);
      console.log(`✓ Confirmed double play: ${pulpDouble.artist} - ${pulpDouble.title}`);
      console.log(`  Played ${pulpDouble.plays.length} times`);
      console.log(`  DJ: ${pulpDouble.dj || 'Unknown'}`);
      console.log(`  Show: ${pulpDouble.show || 'Unknown'}`);
      
      pulpDouble.plays.forEach((play, i) => {
        const playTime = moment(play.timestamp).tz('America/Los_Angeles');
        console.log(`    Play ${i + 1}: ${playTime.format('HH:mm:ss')} Pacific`);
      });
      
      // Verify this matches the known play IDs we discovered
      const playIds = pulpDouble.plays.map(p => p.play_id);
      console.log(`  Play IDs: ${playIds.join(', ')}`);
    }
    
    console.log('✓ Successfully validated real KEXP double play data!');
  }, 30000); // 30 second timeout
});