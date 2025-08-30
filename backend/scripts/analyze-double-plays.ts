#!/usr/bin/env bun

import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('double-plays.json', 'utf-8'));

interface AnalyzedPlay {
  artist: string;
  title: string;
  dj: string;
  show: string;
  timeBetweenSeconds: number;
  songDurations: number[];
  hasEndTimestamps: boolean;
  likely: 'legitimate' | 'partial' | 'mistake';
  reason: string;
}

const analyzed: AnalyzedPlay[] = [];

for (const doublePlay of data.doublePlays) {
  const plays = doublePlay.plays;
  
  // Calculate time between first two plays
  const time1 = new Date(plays[0].timestamp).getTime();
  const time2 = new Date(plays[1].timestamp).getTime();
  const timeBetweenMs = time2 - time1;
  const timeBetweenSeconds = Math.round(timeBetweenMs / 1000);
  
  // Calculate song durations if end timestamps are available
  const songDurations: number[] = [];
  const hasEndTimestamps = plays.every(play => play.end_timestamp);
  
  if (hasEndTimestamps) {
    for (const play of plays) {
      const startTime = new Date(play.timestamp).getTime();
      const endTime = new Date(play.end_timestamp!).getTime();
      const durationSeconds = Math.round((endTime - startTime) / 1000);
      songDurations.push(durationSeconds);
    }
  }
  
  // Determine legitimacy based on end timestamps if available
  let likely: 'legitimate' | 'partial' | 'mistake';
  let reason: string;
  
  if (hasEndTimestamps) {
    // With end timestamps, we can be more precise
    const firstDuration = songDurations[0];
    const secondDuration = songDurations[1];
    
    if (firstDuration < 30) {
      // Very short first play - likely a mistake
      likely = 'mistake';
      reason = `First play only ${firstDuration}s - likely technical error`;
    } else if (firstDuration < 90) {
      // Short first play - likely partial
      likely = 'partial';
      reason = `First play ${firstDuration}s - likely cut short`;
    } else if (Math.abs(firstDuration - secondDuration) > 60 && secondDuration < 90) {
      // Big difference in durations, second is short
      likely = 'partial';
      reason = `Duration mismatch: ${firstDuration}s vs ${secondDuration}s - second may be partial`;
    } else if (firstDuration >= 90 && secondDuration >= 90) {
      // Both plays are reasonably long
      likely = 'legitimate';
      reason = `Both plays full length: ${firstDuration}s, ${secondDuration}s`;
    } else {
      // Edge cases
      likely = 'partial';
      reason = `Durations ${firstDuration}s, ${secondDuration}s - may be partial`;
    }
  } else {
    // Fall back to old logic without end timestamps
    if (timeBetweenSeconds < 30) {
      likely = 'mistake';
      reason = `Only ${timeBetweenSeconds}s apart - likely technical error`;
    } else if (timeBetweenSeconds < 60) {
      likely = 'partial';
      reason = `Only ${timeBetweenSeconds}s apart - likely partial play`;
    } else {
      likely = 'legitimate';
      reason = `${Math.floor(timeBetweenSeconds/60)}m${timeBetweenSeconds%60}s apart - likely full plays`;
    }
  }
  
  analyzed.push({
    artist: doublePlay.artist,
    title: doublePlay.title,
    dj: doublePlay.dj,
    show: doublePlay.show,
    timeBetweenSeconds,
    songDurations,
    hasEndTimestamps,
    likely,
    reason
  });
}

// Sort by legitimacy, then by time between plays
analyzed.sort((a, b) => {
  const order = { 'mistake': 0, 'partial': 1, 'legitimate': 2 };
  if (order[a.likely] !== order[b.likely]) {
    return order[a.likely] - order[b.likely];
  }
  return a.timeBetweenSeconds - b.timeBetweenSeconds;
});

console.log('\n=== TECHNICAL MISTAKES ===\n');
const mistakes = analyzed.filter(p => p.likely === 'mistake');
mistakes.forEach(p => {
  if (p.hasEndTimestamps && p.songDurations.length >= 2) {
    console.log(`${p.artist} - "${p.title}" (${p.dj}): ${p.songDurations[0]}s, ${p.songDurations[1]}s - ${p.reason}`);
  } else {
    console.log(`${p.artist} - "${p.title}" (${p.dj}): ${p.timeBetweenSeconds}s apart - ${p.reason}`);
  }
});

console.log('\n=== PARTIAL PLAYS (cut short or incomplete) ===\n');
const partial = analyzed.filter(p => p.likely === 'partial');
partial.forEach(p => {
  if (p.hasEndTimestamps && p.songDurations.length >= 2) {
    console.log(`${p.artist} - "${p.title}" (${p.dj}): ${p.songDurations[0]}s, ${p.songDurations[1]}s - ${p.reason}`);
  } else {
    console.log(`${p.artist} - "${p.title}" (${p.dj}): ${p.timeBetweenSeconds}s apart - ${p.reason}`);
  }
});

console.log('\n=== LEGITIMATE DOUBLE PLAYS (full songs played twice) ===\n');
const legitimate = analyzed.filter(p => p.likely === 'legitimate');
legitimate.forEach(p => {
  if (p.hasEndTimestamps && p.songDurations.length >= 2) {
    const dur1 = `${Math.floor(p.songDurations[0]/60)}:${(p.songDurations[0]%60).toString().padStart(2, '0')}`;
    const dur2 = `${Math.floor(p.songDurations[1]/60)}:${(p.songDurations[1]%60).toString().padStart(2, '0')}`;
    console.log(`${p.artist} - "${p.title}" (${p.dj}): ${dur1}, ${dur2} - ${p.reason}`);
  } else {
    const mins = Math.floor(p.timeBetweenSeconds / 60);
    const secs = p.timeBetweenSeconds % 60;
    console.log(`${p.artist} - "${p.title}" (${p.dj}): ${mins}m${secs}s apart - ${p.reason}`);
  }
});

// Per-DJ statistics
const djStats = new Map<string, { total: number; legitimate: number; partial: number; mistakes: number }>();

analyzed.forEach(p => {
  if (!djStats.has(p.dj)) {
    djStats.set(p.dj, { total: 0, legitimate: 0, partial: 0, mistakes: 0 });
  }
  const stats = djStats.get(p.dj)!;
  stats.total++;
  if (p.likely === 'legitimate') {
    stats.legitimate++;
  } else if (p.likely === 'partial') {
    stats.partial++;
  } else {
    stats.mistakes++;
  }
});

console.log('\n=== PER-DJ STATISTICS ===\n');
console.log('DJ Name                          | Total | Legit | Partial | Mistakes');
console.log('----------------------------------|-------|-------|---------|----------');

const sortedDJs = Array.from(djStats.entries()).sort((a, b) => b[1].total - a[1].total);
sortedDJs.forEach(([dj, stats]) => {
  const djName = dj.padEnd(32);
  const total = stats.total.toString().padStart(5);
  const legit = stats.legitimate.toString().padStart(5);
  const partial = stats.partial.toString().padStart(7);
  const mistakes = stats.mistakes.toString().padStart(8);
  console.log(`${djName} | ${total} | ${legit} | ${partial} | ${mistakes}`);
});

console.log('\n=== SUMMARY ===\n');
console.log(`Total double plays: ${analyzed.length}`);
console.log(`Legitimate (full songs): ${legitimate.length} (${Math.round(legitimate.length / analyzed.length * 100)}%)`);
console.log(`Partial plays: ${partial.length} (${Math.round(partial.length / analyzed.length * 100)}%)`);
console.log(`Technical mistakes: ${mistakes.length} (${Math.round(mistakes.length / analyzed.length * 100)}%)`);

const withEndTimestamps = analyzed.filter(p => p.hasEndTimestamps).length;
console.log(`\nPlays with end timestamp data: ${withEndTimestamps}/${analyzed.length} (${Math.round(withEndTimestamps / analyzed.length * 100)}%)`);

// Triple plays
const triplePlays = data.doublePlays.filter((dp: any) => dp.plays.length > 2);
if (triplePlays.length > 0) {
  console.log(`\nTriple (or more) plays: ${triplePlays.length}`);
  triplePlays.forEach((tp: any) => {
    console.log(`  - ${tp.artist} - "${tp.title}" (${tp.plays.length} plays, DJ: ${tp.dj})`);
  });
}