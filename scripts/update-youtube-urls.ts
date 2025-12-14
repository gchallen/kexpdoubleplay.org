#!/usr/bin/env bun
/**
 * Update YouTube URLs Script
 * 
 * This script:
 * 1. Downloads the latest double-plays.json from GitHub
 * 2. Parses the existing YouTube.yml file 
 * 3. Adds entries for any tracks that don't have YouTube URLs yet
 * 4. Uses artist + title + album as unique identifiers
 * 5. Preserves existing YouTube URLs and doesn't create duplicates
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import { DoublePlayData, DoublePlay, Play } from '../types/src/index.js';

// Load environment variables from backend .env file
dotenv.config({ path: join(process.cwd(), 'backend', '.env') });


interface YouTubeEntry {
  artist: string;
  title: string;
  album: string | null;
  youtube_id?: string;
  search_url?: string;
  duration?: number; // Track duration in seconds (backward compatibility)
  durations?: number[]; // All play durations for this track
  ignored?: boolean; // Mark track as permanently ignored (no YouTube audio available)
}

interface YouTubeData {
  [key: string]: YouTubeEntry;
}

// Get GitHub configuration from environment or use defaults
const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER || 'gchallen';
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || 'kexpdoubleplay-data';
const GITHUB_FILE = process.env.GITHUB_FILE_PATH || 'double-plays.json';
const YOUTUBE_FILE = 'YouTube.yml';

/**
 * Create a unique key for a track based on artist, title, and album
 */
function createTrackKey(artist: string, title: string, album: string | null): string {
  const normalizeString = (str: string): string => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  };

  const artistKey = normalizeString(artist);
  const titleKey = normalizeString(title);
  const albumKey = album ? normalizeString(album) : 'no_album';
  
  return `${artistKey}__${titleKey}__${albumKey}`;
}

/**
 * Generate a YouTube search URL for the given artist and title
 */
function generateYouTubeSearchUrl(artist: string, title: string): string {
  const query = `${artist} ${title}`;
  const encodedQuery = encodeURIComponent(query);
  return `https://www.youtube.com/results?search_query=${encodedQuery}`;
}

/**
 * Download the latest double-plays.json from GitHub using API with authentication
 */
async function downloadDoublePlayData(): Promise<DoublePlayData> {
  const githubToken = process.env.GITHUB_TOKEN;
  
  if (!githubToken || !GITHUB_OWNER || !GITHUB_REPO_NAME) {
    throw new Error('Missing required GitHub configuration (GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME)');
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/contents/${GITHUB_FILE}`;
  
  console.log(`📥 Downloading ${GITHUB_FILE} from GitHub...`);
  console.log(`   Repository: ${GITHUB_OWNER}/${GITHUB_REPO_NAME}`);
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'User-Agent': 'KEXP-DoublePlay-YouTube-Manager/1.0'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File ${GITHUB_FILE} not found in repository ${GITHUB_OWNER}/${GITHUB_REPO_NAME}`);
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const fileData = await response.json() as { content: string; encoding: string };
    
    if (fileData.encoding !== 'base64') {
      throw new Error(`Unexpected file encoding: ${fileData.encoding}`);
    }

    // Decode base64 content
    const decodedContent = Buffer.from(fileData.content, 'base64').toString('utf8');
    const data = JSON.parse(decodedContent) as DoublePlayData;
    
    console.log(`✅ Successfully downloaded data with ${data.doublePlays.length} double plays`);
    
    return data;
  } catch (error) {
    console.error(`❌ Failed to download data from GitHub:`, error);
    throw error;
  }
}

/**
 * Load existing YouTube.yml file or create empty structure
 */
function loadYouTubeData(): YouTubeData {
  if (!existsSync(YOUTUBE_FILE)) {
    console.log(`📝 ${YOUTUBE_FILE} does not exist, creating new file`);
    return {};
  }
  
  try {
    const yamlContent = readFileSync(YOUTUBE_FILE, 'utf8');
    const data = YAML.parse(yamlContent) || {};
    
    // Clean up deprecated youtube_url fields from all entries
    let cleanupCount = 0;
    for (const [key, entry] of Object.entries(data)) {
      if (entry && typeof entry === 'object' && 'youtube_url' in entry) {
        delete (entry as any).youtube_url;
        cleanupCount++;
      }
    }
    
    if (cleanupCount > 0) {
      console.log(`🧹 Cleaned up ${cleanupCount} deprecated youtube_url fields`);
    }
    
    const entryCount = Object.keys(data).length;
    console.log(`📖 Loaded ${YOUTUBE_FILE} with ${entryCount} existing entries`);
    return data;
  } catch (error) {
    console.error(`❌ Failed to parse ${YOUTUBE_FILE}:`, error);
    throw error;
  }
}

/**
 * Save YouTube data to YAML file
 */
function saveYouTubeData(data: YouTubeData): void {
  try {
    const yamlContent = YAML.stringify(data, {
      sortMapEntries: true, // Sort entries alphabetically by key
      lineWidth: 120,
      indent: 2
    });
    
    writeFileSync(YOUTUBE_FILE, yamlContent, 'utf8');
    const entryCount = Object.keys(data).length;
    console.log(`💾 Saved ${YOUTUBE_FILE} with ${entryCount} total entries`);
  } catch (error) {
    console.error(`❌ Failed to save ${YOUTUBE_FILE}:`, error);
    throw error;
  }
}

/**
 * Upload YouTube.yml file to GitHub repository
 */
async function uploadYouTubeFileToGitHub(yamlContent: string): Promise<void> {
  const githubToken = process.env.GITHUB_TOKEN;
  
  if (!githubToken || !GITHUB_OWNER || !GITHUB_REPO_NAME) {
    throw new Error('Missing required GitHub configuration for upload');
  }

  const fileName = 'YouTube.yml';
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/contents/${fileName}`;
  
  console.log(`📤 Uploading ${fileName} to GitHub...`);

  try {
    // Check if file already exists to get its SHA
    let currentSha: string | null = null;
    
    const checkResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'User-Agent': 'KEXP-DoublePlay-YouTube-Manager/1.0'
      }
    });

    if (checkResponse.ok) {
      const existingFile = await checkResponse.json() as { sha: string };
      currentSha = existingFile.sha;
      console.log(`📝 Updating existing ${fileName} file...`);
    } else if (checkResponse.status === 404) {
      console.log(`📝 Creating new ${fileName} file...`);
    } else {
      throw new Error(`Failed to check existing file: ${checkResponse.status} ${checkResponse.statusText}`);
    }

    // Upload the file
    const uploadPayload = {
      message: `Update YouTube URLs - ${new Date().toISOString()}`,
      content: Buffer.from(yamlContent).toString('base64'),
      ...(currentSha && { sha: currentSha })
    };

    const uploadResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'User-Agent': 'KEXP-DoublePlay-YouTube-Manager/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(uploadPayload)
    });

    if (!uploadResponse.ok) {
      throw new Error(`GitHub upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    const result = await uploadResponse.json();
    console.log(`✅ Successfully uploaded ${fileName} to GitHub`);
    console.log(`   📋 Commit: ${result.commit?.sha?.substring(0, 7)}`);
    console.log(`   🔗 URL: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/blob/main/${fileName}`);

  } catch (error) {
    console.error(`❌ Failed to upload ${fileName} to GitHub:`, error);
    throw error;
  }
}

/**
 * Extract unique tracks from double play data
 */
function extractUniqueTracksFromDoublePlayData(data: DoublePlayData): Set<string> {
  const trackKeys = new Set<string>();
  
  for (const doublePlay of data.doublePlays) {
    // Use the first play's KEXP data since all plays in a double play are the same track
    const firstPlay = doublePlay.plays[0];
    if (firstPlay?.kexpPlay) {
      const { artist, song, album } = firstPlay.kexpPlay;
      const duration = firstPlay.duration;
      const key = createTrackKey(artist, song, album);
      trackKeys.add(key);
    }
  }
  
  return trackKeys;
}

/**
 * Prompt user for input with a message
 */
async function promptUser(message: string): Promise<string> {
  process.stdout.write(message);
  
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setEncoding('utf8');
    
    const onData = (data: string) => {
      stdin.off('data', onData);
      resolve(data.toString().trim());
    };
    
    stdin.on('data', onData);
  });
}

/**
 * Format duration in seconds to MM:SS format
 */
function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null) {
    return '';
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Format multiple durations, showing all if they differ significantly
 */
function formatMultipleDurations(durations: number[]): string {
  if (durations.length === 0) return '';
  if (durations.length === 1) return formatDuration(durations[0]);
  
  // Check if durations are significantly different (more than 10 seconds apart)
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const difference = max - min;
  
  if (difference > 10) {
    // Show all durations if they differ significantly
    const formatted = durations.map(d => formatDuration(d)).join(', ');
    return `${formatted}`;
  } else {
    // Show just the first duration if they're all similar
    return formatDuration(durations[0]);
  }
}

/**
 * Save YouTube data to both local YAML file and GitHub
 */
async function saveYouTubeDataToFile(youtubeData: { [key: string]: YouTubeEntry }): Promise<void> {
  try {
    // Generate YAML content
    const yamlContent = YAML.stringify(youtubeData, {
      sortMapEntries: true,
      lineWidth: 120,
      indent: 2
    });
    
    // Save locally first
    await fs.writeFile(YOUTUBE_FILE, yamlContent, 'utf8');
    
    // Upload to GitHub
    await uploadYouTubeFileToGitHub(yamlContent);
  } catch (error) {
    console.error('   ⚠️  Error saving YouTube data:', error);
    throw error;
  }
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 */
function extractYouTubeId(url: string): string | null {
  // Handle different YouTube URL formats:
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://www.youtube.com/watch?v=VIDEO_ID&other=params
  // https://m.youtube.com/watch?v=VIDEO_ID
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Just the ID itself
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Interactive YouTube search using Puppeteer
 */
async function interactiveYouTubeSearch(tracksNeedingUrls: YouTubeEntry[], youtubeData: { [key: string]: YouTubeEntry }): Promise<{ [key: string]: string }> {
  console.log('\n🎬 Starting interactive YouTube search...');
  console.log('   Opening browser window for YouTube searches...\n');
  
  const browser = await puppeteer.launch({ 
    headless: false, // Show the browser window
    defaultViewport: null, // Let browser control viewport
    args: [
      '--start-maximized'
    ]
  });
  
  // Get the default page that opens automatically and ensure it's ready
  const pages = await browser.pages();
  let page = pages[0]; // Use the first (blank) page instead of creating a new one
  
  // If the default page doesn't exist or has issues, create a new one
  if (!page || page.isClosed()) {
    page = await browser.newPage();
  }
  const updatedUrls: { [key: string]: string } = {};
  
  try {
    for (let i = 0; i < tracksNeedingUrls.length; i++) {
      const track = tracksNeedingUrls[i];
      const trackKey = createTrackKey(track.artist, track.title, track.album);
      
      const durationText = track.durations ? ` (${formatMultipleDurations(track.durations)})` : 
                        track.duration !== undefined ? ` (${formatDuration(track.duration)})` : '';
      console.log(`🔍 Track ${i + 1}/${tracksNeedingUrls.length}: ${track.artist} - "${track.title}"${durationText}`);
      console.log(`   Album: ${track.album || 'No album'}`);
      
      
      // Navigate to the YouTube search URL
      console.log('   📡 Loading YouTube search...');
      await page.goto(track.search_url!, { waitUntil: 'networkidle0' });
      
      // Wait a moment for page to fully load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('   🎯 Find the correct video in the browser window above');
      console.log('   💡 CLICK on the video you want to use, then return here');
      console.log('   📋 Options:');
      console.log('     1. Type "c" or "current" to use the current page URL (after clicking a video)');
      console.log('     2. Paste a YouTube URL manually');
      console.log('     3. Type "i" or "ignore" to permanently ignore this track (no YouTube available)');
      console.log('     4. Press Enter to skip');

      const userInput = await promptUser('   ✏️  Your choice: ');
      
      let urlToProcess = '';

      // Handle ignore option
      if (userInput.trim().toLowerCase() === 'i' || userInput.trim().toLowerCase() === 'ignore') {
        youtubeData[trackKey].ignored = true;
        await saveYouTubeDataToFile(youtubeData);
        console.log('   🚫 Track marked as permanently ignored and file updated!\n');
        continue;
      }

      if (userInput.trim().toLowerCase() === 'c' || userInput.trim().toLowerCase() === 'current') {
        // Get current URL from the browser page
        try {
          const currentUrl = await page.url();
          console.log(`   📡 Current page URL: ${currentUrl}`);
          urlToProcess = currentUrl;
        } catch (error) {
          console.log('   ⚠️  Error getting current page URL, skipping...\n');
          updatedUrls[trackKey] = '';
          continue;
        }
      } else if (userInput.trim()) {
        urlToProcess = userInput.trim();
      }
      
      if (urlToProcess) {
        // Extract YouTube video ID from the URL
        const videoId = extractYouTubeId(urlToProcess);
        if (videoId) {
          updatedUrls[trackKey] = videoId;
          // Update the data immediately and save to file
          youtubeData[trackKey].youtube_id = videoId;
          await saveYouTubeDataToFile(youtubeData);
          console.log('   ✅ YouTube video ID saved and file updated!\n');
        } else {
          console.log('   ⚠️  Invalid YouTube URL format, skipping...\n');
          updatedUrls[trackKey] = '';
        }
      } else {
        console.log('   ⏭️  Skipped (no URL provided)\n');
        updatedUrls[trackKey] = '';
      }
    }
    
  } finally {
    console.log('🔒 Closing browser...');
    await browser.close();
  }
  
  return updatedUrls;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Check for interactive mode flag
    const isInteractiveMode = process.argv.includes('--interactive') || process.argv.includes('-i');
    
    console.log('🎵 KEXP Double Play YouTube URL Manager');
    console.log('=====================================');
    if (isInteractiveMode) {
      console.log('🎬 Interactive Mode: Will open browser for YouTube searches');
    }
    console.log('');
    
    // Download latest data from GitHub
    const doublePlayData = await downloadDoublePlayData();
    
    // Load existing YouTube data
    const youtubeData = loadYouTubeData();
    
    // Extract unique tracks from double play data
    console.log('\n🔍 Analyzing tracks from double play data...');
    const uniqueTrackKeys = extractUniqueTracksFromDoublePlayData(doublePlayData);
    console.log(`📊 Found ${uniqueTrackKeys.size} unique tracks in double play data`);
    
    // Find tracks that don't have YouTube entries yet OR have empty URLs
    const newEntries: YouTubeEntry[] = [];
    const tracksNeedingUrls: YouTubeEntry[] = [];
    
    if (isInteractiveMode) {
      // In interactive mode, process tracks in YAML file order (top to bottom)
      console.log('🎬 Processing tracks in YAML file order...');
      
      // Create a map of track keys to all play durations from double plays data
      const durationMap = new Map<string, number[]>();
      for (const doublePlay of doublePlayData.doublePlays) {
        if (doublePlay.plays.length > 0 && doublePlay.plays[0]?.kexpPlay) {
          const { artist, song, album } = doublePlay.plays[0].kexpPlay;
          const key = createTrackKey(artist, song, album);
          
          // Collect all durations for this track
          const durations = doublePlay.plays
            .map(play => play.duration)
            .filter((duration): duration is number => duration !== undefined && duration !== null);
          
          if (durations.length > 0) {
            durationMap.set(key, durations);
          }
        }
      }
      
      console.log(`🎵 Found ${durationMap.size} tracks with duration data`);
      
      // Get all YAML entries in their original order and enrich with duration
      for (const [key, entry] of Object.entries(youtubeData)) {
        // Enrich with duration data if not already present
        if (durationMap.has(key)) {
          const durations = durationMap.get(key)!;
          entry.durations = durations;
          // Keep the single duration field for backward compatibility (use first duration)
          entry.duration = durations[0];
        }
        
        // Check if this track needs a YouTube ID (skip ignored tracks)
        if (!entry.ignored && (!entry.youtube_id || entry.youtube_id.trim() === '')) {
          tracksNeedingUrls.push(entry);
        }
      }
    } else {
      // In non-interactive mode, process from double plays data as before
      for (const doublePlay of doublePlayData.doublePlays) {
        const firstPlay = doublePlay.plays[0];
        if (firstPlay?.kexpPlay) {
          const { artist, song, album } = firstPlay.kexpPlay;
          const duration = firstPlay.duration;
          const key = createTrackKey(artist, song, album);
          
          // Check if entry exists
          if (youtubeData[key]) {
            // Entry already exists, skip
          } else {
            // Add new entry
            const newEntry: YouTubeEntry = {
              artist: artist,
              title: song,
              album: album,
              youtube_id: '', // Empty, ready for manual entry
              search_url: generateYouTubeSearchUrl(artist, song),
              duration: duration
            };
            
            youtubeData[key] = newEntry;
            newEntries.push(newEntry);
          }
        }
      }
    }
    
    console.log(`✨ Found ${newEntries.length} new tracks that need YouTube URLs`);

    // Always show summary of tracks needing URLs
    const tracksWithoutUrls = Object.values(youtubeData)
      .filter(entry => !entry.ignored && (!entry.youtube_id || entry.youtube_id.trim() === ''));
    const ignoredCount = Object.values(youtubeData).filter(e => e.ignored).length;

    if (tracksWithoutUrls.length > 0) {
      console.log(`\n📋 Tracks still needing YouTube URLs (${tracksWithoutUrls.length}):`);
      tracksWithoutUrls.forEach((entry, index) => {
        const albumText = entry.album ? ` (${entry.album})` : ' (no album)';
        console.log(`   ${index + 1}. ${entry.artist} - "${entry.title}"${albumText}`);
      });
      console.log(`\n💡 Run with --interactive or -i flag to search for these`);
    }
    if (ignoredCount > 0) {
      console.log(`🚫 ${ignoredCount} tracks are permanently ignored`);
    }
    
    if (isInteractiveMode && tracksNeedingUrls.length > 0) {
      console.log(`🎬 Found ${tracksNeedingUrls.length} tracks that need YouTube URLs in interactive mode`);
      
      if (newEntries.length > 0) {
        console.log('\n📝 New tracks added:');
        newEntries.forEach((entry, index) => {
          const albumText = entry.album ? ` (${entry.album})` : ' (no album)';
          console.log(`   ${index + 1}. ${entry.artist} - "${entry.title}"${albumText}`);
        });
      }
      
      // Start interactive YouTube search
      const updatedUrls = await interactiveYouTubeSearch(tracksNeedingUrls, youtubeData);
      
      // Apply the updated URLs
      let urlsUpdated = 0;
      for (const [trackKey, newUrl] of Object.entries(updatedUrls)) {
        if (newUrl && newUrl.trim() !== '') {
          youtubeData[trackKey].youtube_id = newUrl;
          urlsUpdated++;
        }
      }
      
      const ignoredCount = Object.values(youtubeData).filter(e => e.ignored).length;
      console.log(`\n📊 Results:`);
      console.log(`   🆕 New tracks added: ${newEntries.length}`);
      console.log(`   🔗 YouTube URLs found: ${urlsUpdated}`);
      console.log(`   🚫 Tracks ignored (total): ${ignoredCount}`);
      console.log(`   ⏭️  Tracks skipped: ${tracksNeedingUrls.length - urlsUpdated}`);
      
      // Save and upload updated data
      saveYouTubeData(youtubeData);
      const yamlContent = YAML.stringify(youtubeData, {
        sortMapEntries: true,
        lineWidth: 120,
        indent: 2
      });
      await uploadYouTubeFileToGitHub(yamlContent);
      
    } else if (newEntries.length > 0) {
      console.log('\n📝 New tracks added:');
      newEntries.forEach((entry, index) => {
        const albumText = entry.album ? ` (${entry.album})` : ' (no album)';
        console.log(`   ${index + 1}. ${entry.artist} - "${entry.title}"${albumText}`);
      });
      
      // Save updated data locally
      saveYouTubeData(youtubeData);
      
      // Upload to GitHub
      const yamlContent = YAML.stringify(youtubeData, {
        sortMapEntries: true,
        lineWidth: 120,
        indent: 2
      });
      await uploadYouTubeFileToGitHub(yamlContent);
      
      console.log(`\n🎯 Next steps:`);
      console.log(`   1. Run with --interactive flag to find YouTube URLs automatically`);
      console.log(`   2. Or manually open ${YOUTUBE_FILE} and add YouTube URLs`);
      console.log(`   3. Use the search_url links to find videos on YouTube`);
    } else {
      console.log('✅ All tracks already have entries in the YouTube file');

      if (isInteractiveMode) {
        const tracksWithoutUrls = Object.values(youtubeData)
          .filter(entry => !entry.ignored && (!entry.youtube_id || entry.youtube_id.trim() === '')).length;
        const ignoredCount = Object.values(youtubeData).filter(e => e.ignored).length;
        
        if (tracksWithoutUrls > 0) {
          console.log(`💡 Note: ${tracksWithoutUrls} tracks still need YouTube URLs`);
          console.log('   Run with --interactive to search for them');
        } else {
          console.log('🎉 All tracks have YouTube URLs!');
        }
        if (ignoredCount > 0) {
          console.log(`🚫 ${ignoredCount} tracks are permanently ignored`);
        }
      }
      
      // Still upload current state to GitHub to ensure it's in sync
      const yamlContent = YAML.stringify(youtubeData, {
        sortMapEntries: true,
        lineWidth: 120,
        indent: 2
      });
      await uploadYouTubeFileToGitHub(yamlContent);
    }
    
    console.log('\n🏁 Script completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main().catch((error) => {
    console.error('\n💥 Unhandled error:', error);
    process.exit(1);
  });
}