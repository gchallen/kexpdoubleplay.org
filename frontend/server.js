const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

// Dynamic import of node-fetch to handle both CommonJS and ES modules
async function getFetch() {
  if (typeof fetch !== 'undefined') {
    return fetch;
  }
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch;
}

const app = express();
const PORT = process.env.PORT || 8080;
const BACKEND_API_URL = 'https://api.kexpdoubleplays.org';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Initialize YouTube API
const youtube = YOUTUBE_API_KEY ? google.youtube({
  version: 'v3',
  auth: YOUTUBE_API_KEY
}) : null;

// Shared application state
let sharedData = {
  doublePlays: [],
  lastBackendFetch: null,
  lastYouTubeUpdate: null,
  totalCount: 0,
  youtubeProcessingStatus: 'idle', // idle, processing, complete
  metadata: {},
  retrievalStatus: 'loading'
};

// Background processing state
let isProcessingYouTube = false;
let backgroundTasks = [];

// YouTube cache - using double play timestamp as key to avoid duplicates
let youtubeCache = new Map();

// Stub YouTube lookup (1 second delay)
async function findYouTubeVideoStub(artist, title) {
  console.log(`[STUB] Looking up YouTube for: ${artist} - ${title}`);
  
  // Simulate 1 second delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Return stub data for now
  return {
    videoId: `stub_${Date.now()}`,
    url: `https://youtube.com/watch?v=stub_${Date.now()}`,
    title: `${title} - ${artist} (YouTube Stub)`,
    channelTitle: 'Stub Channel',
    thumbnail: 'https://via.placeholder.com/120x90/333/fff?text=Stub'
  };
}

// Fetch data from backend API
async function fetchBackendData() {
  try {
    console.log('📡 Fetching data from backend API...');
    const fetch = await getFetch();
    const response = await fetch(`${BACKEND_API_URL}/api/double-plays`);
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const backendData = await response.json();
    console.log(`📊 Found ${backendData.doublePlays.length} double plays from backend`);

    // Update shared state with fresh backend data, preserving cached YouTube links
    sharedData = {
      ...sharedData,
      doublePlays: backendData.doublePlays.map(dp => {
        const cacheKey = dp.plays[0].timestamp; // Use first play timestamp as cache key
        const cachedYouTube = youtubeCache.get(cacheKey);
        
        return {
          ...dp,
          youtube: cachedYouTube || dp.youtube || null
        };
      }),
      lastBackendFetch: new Date().toISOString(),
      totalCount: backendData.totalCount,
      metadata: backendData.metadata,
      retrievalStatus: backendData.retrievalStatus
    };

    console.log(`✅ Updated shared state with ${sharedData.doublePlays.length} double plays`);
    return true;

  } catch (error) {
    console.error('❌ Error fetching backend data:', error.message);
    sharedData.retrievalStatus = 'error';
    return false;
  }
}

// Process YouTube lookups in background
async function processYouTubeLinks() {
  if (isProcessingYouTube) {
    console.log('⏳ YouTube processing already in progress, skipping...');
    return;
  }

  isProcessingYouTube = true;
  sharedData.youtubeProcessingStatus = 'processing';
  
  try {
    console.log('🎵 Starting YouTube link processing...');
    
    // Find double plays without YouTube links
    const needsYouTube = sharedData.doublePlays.filter(dp => !dp.youtube);
    console.log(`🔍 Found ${needsYouTube.length} double plays needing YouTube links`);

    for (let i = 0; i < needsYouTube.length; i++) {
      const doublePlay = needsYouTube[i];
      const cacheKey = doublePlay.plays[0].timestamp;
      
      try {
        // Check cache first to avoid duplicate API calls
        let youtubeData = youtubeCache.get(cacheKey);
        
        if (youtubeData) {
          console.log(`[${i + 1}/${needsYouTube.length}] Using cached YouTube data for: ${doublePlay.artist} - ${doublePlay.title}`);
        } else {
          console.log(`[${i + 1}/${needsYouTube.length}] Processing: ${doublePlay.artist} - ${doublePlay.title}`);
          youtubeData = await findYouTubeVideoStub(doublePlay.artist, doublePlay.title);
          
          // Cache the result
          youtubeCache.set(cacheKey, youtubeData);
        }
        
        // Update the specific double play in shared state
        const dpIndex = sharedData.doublePlays.findIndex(dp => 
          dp.artist === doublePlay.artist && 
          dp.title === doublePlay.title &&
          dp.plays[0].play_id === doublePlay.plays[0].play_id
        );
        
        if (dpIndex !== -1) {
          sharedData.doublePlays[dpIndex].youtube = youtubeData;
          console.log(`✅ Updated YouTube link for: ${doublePlay.artist} - ${doublePlay.title}`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to process YouTube for ${doublePlay.artist} - ${doublePlay.title}:`, error.message);
      }
    }
    
    sharedData.lastYouTubeUpdate = new Date().toISOString();
    sharedData.youtubeProcessingStatus = 'complete';
    console.log(`🎉 YouTube processing complete! Updated ${needsYouTube.length} tracks`);
    
  } catch (error) {
    console.error('❌ YouTube processing failed:', error.message);
    sharedData.youtubeProcessingStatus = 'error';
  } finally {
    isProcessingYouTube = false;
  }
}

// Background task to periodically update data
function startBackgroundTasks() {
  console.log('⚙️  Starting background tasks...');
  
  // Start YouTube processing immediately in background (don't wait for page loads)
  setTimeout(() => processYouTubeLinks(), 2000);
  
  // Periodic backend data fetch (every 5 minutes)
  const backendInterval = setInterval(async () => {
    console.log('🔄 Periodic backend data fetch...');
    const success = await fetchBackendData();
    
    // If we got new data and aren't currently processing YouTube, start processing
    if (success && !isProcessingYouTube) {
      setTimeout(() => processYouTubeLinks(), 1000);
    }
  }, 5 * 60 * 1000);
  
  backgroundTasks.push(backendInterval);
  
  console.log('✅ Background tasks started');
}

// Stop background tasks (for graceful shutdown)
function stopBackgroundTasks() {
  console.log('🛑 Stopping background tasks...');
  backgroundTasks.forEach(task => clearInterval(task));
  backgroundTasks = [];
}

// Routes

// API endpoint to inspect current shared state
app.get('/api/status', (req, res) => {
  res.json({
    lastBackendFetch: sharedData.lastBackendFetch,
    lastYouTubeUpdate: sharedData.lastYouTubeUpdate,
    totalDoublePlays: sharedData.doublePlays.length,
    youtubeProcessingStatus: sharedData.youtubeProcessingStatus,
    doublePlaysWithYouTube: sharedData.doublePlays.filter(dp => dp.youtube).length,
    retrievalStatus: sharedData.retrievalStatus
  });
});

// Helper function to format timestamp
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Helper function to get image URL
function getImageUrl(play) {
  return play.kexpPlay.thumbnail_uri || play.kexpPlay.image_uri || '';
}

// Helper function to format DJ/Show names
function formatDJShowText(dj, show) {
  return `<span class="dj-name">${dj}</span> on <span class="show-name">${show}</span>`;
}

// Helper function to render double plays HTML
function renderDoubleePlaysHTML(doublePlays) {
  if (!doublePlays || doublePlays.length === 0) {
    return '<div style="text-align: center; padding: 40px; color: #666;">No double plays found.</div>';
  }

  return doublePlays.map((doublePlay, index) => {
    const number = doublePlays.length - index;
    const firstPlay = doublePlay.plays[0];
    const hasYouTube = doublePlay.youtube && doublePlay.youtube.url;
    
    const playButtonHTML = hasYouTube 
      ? `<a href="${doublePlay.youtube.url}" target="_blank" rel="noopener noreferrer" title="Watch on YouTube">
           <svg width="32" height="32" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">
             <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
               <g class="fill-black">
                 <path d="M32.92,0.33 C14.9278648,0.330000848 0.341841956,14.9145326 0.340001705,32.9066677 C0.338161454,50.8988028 14.9212005,65.486318 32.9133354,65.4899993 C50.9054702,65.4936807 65.4944776,50.9121344 65.5,32.92 C65.4834701,14.9317947 50.9081993,0.352050299 32.92,0.33 L32.92,0.33 Z M32.92,60.5 C17.6879866,60.5 5.34,48.1520134 5.34,32.92 C5.34,17.6879866 17.6879866,5.34 32.92,5.34 C48.1520134,5.34 60.5,17.6879866 60.5,32.92 C60.4834659,48.1451595 48.1451595,60.4834659 32.92,60.5 L32.92,60.5 Z"></path>
                 <polygon points="29.28 17.16 25.94 20.51 38.16 32.73 25.46 45.42 28.83 48.79 41.52 36.1 41.55 36.13 44.91 32.78"></polygon>
               </g>
             </g>
           </svg>
         </a>`
      : `<svg width="32" height="32" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">
           <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
             <g class="fill-black">
               <path d="M32.92,0.33 C14.9278648,0.330000848 0.341841956,14.9145326 0.340001705,32.9066677 C0.338161454,50.8988028 14.9212005,65.486318 32.9133354,65.4899993 C50.9054702,65.4936807 65.4944776,50.9121344 65.5,32.92 C65.4834701,14.9317947 50.9081993,0.352050299 32.92,0.33 L32.92,0.33 Z M32.92,60.5 C17.6879866,60.5 5.34,48.1520134 5.34,32.92 C5.34,17.6879866 17.6879866,5.34 32.92,5.34 C48.1520134,5.34 60.5,17.6879866 60.5,32.92 C60.4834659,48.1451595 48.1451595,60.4834659 32.92,60.5 L32.92,60.5 Z"></path>
               <polygon points="29.28 17.16 25.94 20.51 38.16 32.73 25.46 45.42 28.83 48.79 41.52 36.1 41.55 36.13 44.91 32.78"></polygon>
             </g>
           </g>
         </svg>`;

    const imageUrl = getImageUrl(firstPlay);
    
    return `
      <div class="playlist-item">
        <div class="item-content">
          <div class="track-number">${number}.</div>
          
          <div class="play-button${hasYouTube ? '' : ' invisible'}">
            ${playButtonHTML}
          </div>
          
          <div class="timestamp">${formatTime(firstPlay.timestamp)}</div>
          
          <div class="track-info">
            <div class="track-line">
              <span class="track-title">${doublePlay.title}</span>
              <span class="separator">•</span>
              <span class="artist-name">${doublePlay.artist}</span>
              <span class="separator">•</span>
              <span class="release-year">${firstPlay.kexpPlay.album || ''} • ${new Date(firstPlay.timestamp).getFullYear()}</span>
            </div>
            ${doublePlay.dj && doublePlay.show ? `<div class="show-dj-line">${formatDJShowText(doublePlay.dj, doublePlay.show)}</div>` : ''}
          </div>
          
          <div class="album-covers">
            <div class="album-cover-container">
              <img src="${imageUrl}" 
                   alt="${doublePlay.artist} - ${doublePlay.title}"
                   class="album-cover"
                   loading="lazy" />
            </div>
            <div class="album-cover-container">
              <img src="${imageUrl}" 
                   alt="${doublePlay.artist} - ${doublePlay.title} (second play)"
                   class="album-cover"
                   loading="lazy" />
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Main route - serve rendered HTML
app.get('/', (req, res) => {
  try {
    // Read the HTML template
    const templatePath = path.join(__dirname, 'template.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    
    // Determine theme from cookie or default to light
    const theme = req.headers.cookie?.includes('theme=dark') ? 'dark' : '';
    const themeClass = theme;
    const sunDisplay = theme === 'dark' ? 'display: block' : 'display: none';
    const moonDisplay = theme === 'dark' ? 'display: none' : 'display: block';
    
    // Filter to legitimate double plays and sort newest first
    const legitimateDoublePlays = (sharedData.doublePlays || [])
      .filter(dp => !dp.classification || dp.classification === 'legitimate')
      .sort((a, b) => new Date(b.plays[0].timestamp) - new Date(a.plays[0].timestamp));
    
    // Generate status text
    const totalPlays = legitimateDoublePlays.length;
    const withYouTube = legitimateDoublePlays.filter(dp => dp.youtube).length;
    const lastUpdate = sharedData.lastBackendFetch ? 
      new Date(sharedData.lastBackendFetch).toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }) : 'Never';
    
    const statusText = `Found ${totalPlays} double plays (${withYouTube} with YouTube links) • Last updated ${lastUpdate}`;
    
    // Render double plays HTML
    const doubleePlaysHTML = renderDoubleePlaysHTML(legitimateDoublePlays);
    
    // Replace template placeholders
    html = html.replace('{{THEME_CLASS}}', themeClass);
    html = html.replace('{{SUN_DISPLAY}}', sunDisplay);
    html = html.replace('{{MOON_DISPLAY}}', moonDisplay);
    html = html.replace('{{STATUS_TEXT}}', statusText);
    html = html.replace('{{DOUBLE_PLAYS_HTML}}', doubleePlaysHTML);
    
    console.log(`📄 Served page with ${totalPlays} double plays (${withYouTube} with YouTube)`);
    res.send(html);
    
  } catch (error) {
    console.error('❌ Error serving page:', error);
    res.status(500).send('Error loading page');
  }
});

// Serve static files (favicon, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Frontend server running on port ${PORT}`);
  console.log(`🎬 YouTube API ${YOUTUBE_API_KEY ? 'enabled' : 'disabled (set YOUTUBE_API_KEY to enable)'}`);
  console.log(`📱 Visit http://localhost:${PORT} to see the KEXP Double Plays frontend`);
  console.log(`📊 Status endpoint: http://localhost:${PORT}/api/status`);
  
  // Do initial backend data fetch asynchronously but immediately
  console.log('⚡ Performing initial backend data fetch for immediate page serving...');
  fetchBackendData().then(() => {
    console.log('✅ Initial data loaded - pages will serve immediately');
    
    // Start background processing after initial data load
    startBackgroundTasks();
  }).catch(error => {
    console.error('❌ Failed to load initial data:', error.message);
    // Still start background tasks even if initial fetch fails
    startBackgroundTasks();
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  stopBackgroundTasks();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  stopBackgroundTasks();
  process.exit(0);
});