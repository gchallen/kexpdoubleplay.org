import { test, expect } from "bun:test";
import { DoublePlayDetector } from '../detector';
import { KEXPPlay } from '../types';

test('Worthitpurchase "Something New" partial double play detection', async () => {
  // Test case based on real KEXP data from 2025-07-29
  // This tests detection of a "partial" double play where the first play was cut short
  // and restarted. Actual song duration is ~4:17 (257 seconds).
  const testPlays: KEXPPlay[] = [
    // First play of "Something New"
    {
      airdate: "2025-07-29T09:29:38-07:00",
      artist: "Worthitpurchase",
      song: "Something New",
      album: "Something New",
      play_id: 3533217,
      play_type: "trackplay",
      image_uri: "https://ia800501.us.archive.org/31/items/mbid-12d3b5a6-e14a-4908-a40d-e9ee2e9b0a5b/mbid-12d3b5a6-e14a-4908-a40d-e9ee2e9b0a5b-42569580069_thumb500.jpg",
      thumbnail_uri: "https://dn721601.ca.archive.org/0/items/mbid-12d3b5a6-e14a-4908-a40d-e9ee2e9b0a5b/mbid-12d3b5a6-e14a-4908-a40d-e9ee2e9b0a5b-42569580069_thumb250.jpg",
      show: {
        id: 64144,
        name: "Unknown Show"
      }
    },
    // What should be an airbreak or other content between the plays
    {
      airdate: "2025-07-29T09:32:15-07:00", // This is where the first play ends according to our data
      artist: "",
      song: "",
      album: null,
      play_id: 9999998, // Mock airbreak ID
      play_type: "airbreak", // This should be the separator
      image_uri: null,
      thumbnail_uri: null
    },
    // Second play of "Something New" 
    {
      airdate: "2025-07-29T09:33:56-07:00",
      artist: "Worthitpurchase", 
      song: "Something New",
      album: "Something New",
      play_id: 3533218,
      play_type: "trackplay",
      image_uri: "https://dn721601.ca.archive.org/0/items/mbid-12d3b5a6-e14a-4908-a40d-e9ee2e9b0a5b/mbid-12d3b5a6-e14a-4908-a40d-e9ee2e9b0a5b-42569580069_thumb250.jpg",
      thumbnail_uri: "https://ia800501.us.archive.org/31/items/mbid-12d3b5a6-e14a-4908-a40d-e9ee2e9b0a5b/mbid-12d3b5a6-e14a-4908-a40d-e9ee2e9b0a5b-42569580069_thumb500.jpg",
      show: {
        id: 64144,
        name: "Unknown Show"
      }
    },
    // What comes after the second play
    {
      airdate: "2025-07-29T09:38:07-07:00", // This is where the second play ends according to our data
      artist: "Next Artist",
      song: "Next Song",
      album: "Next Album",
      play_id: 9999999, // Mock next track ID
      play_type: "trackplay",
      image_uri: null,
      thumbnail_uri: null
    }
  ];

  const detector = new DoublePlayDetector();
  const result = await detector.detectDoublePlays(testPlays);

  // Verify we found the double play
  expect(result).toHaveLength(1);
  
  const doublePlay = result[0];
  expect(doublePlay.artist).toBe("Worthitpurchase");
  expect(doublePlay.title).toBe("Something New");
  expect(doublePlay.plays).toHaveLength(2);

  // Check calculated durations match the actual KEXP timestamps
  const firstPlay = doublePlay.plays[0];
  const secondPlay = doublePlay.plays[1];

  expect(firstPlay.duration).toBe(157); // 2:37 - cut short (first play interrupted)
  expect(secondPlay.duration).toBe(251); // 4:11 - nearly complete (actual song ~4:17)
  
  // Verify end timestamps are calculated correctly
  expect(firstPlay.end_timestamp).toBe("2025-07-29T09:32:15-07:00"); // airbreak starts
  expect(secondPlay.end_timestamp).toBe("2025-07-29T09:38:07-07:00"); // next song starts

  // Classification should be "partial" due to significant duration difference
  // This indicates the first play was cut short and restarted
  expect(doublePlay.classification).toBe("partial");
  
  // Verify the percentage difference calculation that drives classification
  const maxDuration = Math.max(firstPlay.duration!, secondPlay.duration!);
  const minDuration = Math.min(firstPlay.duration!, secondPlay.duration!);
  const percentDifference = ((maxDuration - minDuration) / maxDuration) * 100;
  
  expect(percentDifference).toBeCloseTo(37.5, 1); // ~37.5% difference
  expect(percentDifference).toBeGreaterThan(10); // > 10% triggers "partial" classification
});