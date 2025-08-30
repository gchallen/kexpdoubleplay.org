#!/usr/bin/env bun

import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('double-plays.json', 'utf-8'));

interface AnalyzedPlay {
  artist: string;
  title: string;
  dj: string;
  show: string;
  timeBetweenSeconds: number;
  likely: 'legitimate' | 'mistake';
}

const analyzed: AnalyzedPlay[] = [];

for (const doublePlay of data.doublePlays) {
  const plays = doublePlay.plays;
  
  // Calculate time between first two plays
  const time1 = new Date(plays[0].timestamp).getTime();
  const time2 = new Date(plays[1].timestamp).getTime();
  const timeBetweenMs = time2 - time1;
  const timeBetweenSeconds = Math.round(timeBetweenMs / 1000);
  
  // Generally, if songs are played less than 60 seconds apart, it's likely a mistake
  // Songs typically are at least 2-3 minutes long
  const likely = timeBetweenSeconds >= 60 ? 'legitimate' : 'mistake';
  
  analyzed.push({
    artist: doublePlay.artist,
    title: doublePlay.title,
    dj: doublePlay.dj,
    show: doublePlay.show,
    timeBetweenSeconds,
    likely
  });
}

// Sort by time between plays
analyzed.sort((a, b) => a.timeBetweenSeconds - b.timeBetweenSeconds);

console.log('\n=== LIKELY MISTAKES (< 60 seconds apart) ===\n');
const mistakes = analyzed.filter(p => p.likely === 'mistake');
mistakes.forEach(p => {
  console.log(`${p.timeBetweenSeconds}s: ${p.artist} - "${p.title}" (${p.dj})`);
});

console.log('\n=== LIKELY LEGITIMATE (≥ 60 seconds apart) ===\n');
const legitimate = analyzed.filter(p => p.likely === 'legitimate');
legitimate.forEach(p => {
  const mins = Math.floor(p.timeBetweenSeconds / 60);
  const secs = p.timeBetweenSeconds % 60;
  console.log(`${mins}m${secs}s: ${p.artist} - "${p.title}" (${p.dj})`);
});

// Per-DJ statistics
const djStats = new Map<string, { total: number; legitimate: number; mistakes: number }>();

analyzed.forEach(p => {
  if (!djStats.has(p.dj)) {
    djStats.set(p.dj, { total: 0, legitimate: 0, mistakes: 0 });
  }
  const stats = djStats.get(p.dj)!;
  stats.total++;
  if (p.likely === 'legitimate') {
    stats.legitimate++;
  } else {
    stats.mistakes++;
  }
});

console.log('\n=== PER-DJ STATISTICS ===\n');
console.log('DJ Name                          | Total | Legit | Mistakes');
console.log('----------------------------------|-------|-------|----------');

const sortedDJs = Array.from(djStats.entries()).sort((a, b) => b[1].total - a[1].total);
sortedDJs.forEach(([dj, stats]) => {
  const djName = dj.padEnd(32);
  const total = stats.total.toString().padStart(5);
  const legit = stats.legitimate.toString().padStart(5);
  const mistakes = stats.mistakes.toString().padStart(8);
  console.log(`${djName} | ${total} | ${legit} | ${mistakes}`);
});

console.log('\n=== SUMMARY ===\n');
console.log(`Total double plays: ${analyzed.length}`);
console.log(`Likely legitimate: ${legitimate.length} (${Math.round(legitimate.length / analyzed.length * 100)}%)`);
console.log(`Likely mistakes: ${mistakes.length} (${Math.round(mistakes.length / analyzed.length * 100)}%)`);

// Triple plays
const triplePlays = data.doublePlays.filter((dp: any) => dp.plays.length > 2);
if (triplePlays.length > 0) {
  console.log(`\nTriple (or more) plays: ${triplePlays.length}`);
  triplePlays.forEach((tp: any) => {
    console.log(`  - ${tp.artist} - "${tp.title}" (${tp.plays.length} plays, DJ: ${tp.dj})`);
  });
}