const express = require('express');
const path = require('path');
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

// Main route - serve page with current shared data immediately
app.get('/', (req, res) => {
  try {
    // Read the base HTML file
    const htmlPath = path.join(__dirname, 'dist', 'index.html');
    const fs = require('fs');
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // Prepare enhanced data from shared state (handle case where data hasn't loaded yet)
    const enhancedData = {
      ...sharedData.metadata,
      doublePlays: sharedData.doublePlays || [],
      totalCount: sharedData.totalCount || 0,
      retrievalStatus: sharedData.retrievalStatus || 'loading',
      enhancedAt: sharedData.lastYouTubeUpdate || sharedData.lastBackendFetch,
      youtubeApiEnabled: !!youtube
    };
    
    // Inject enhanced data into the page
    const dataScript = `
      <script>
        window.ENHANCED_DOUBLE_PLAY_DATA = ${JSON.stringify(enhancedData)};
      </script>
    `;
    
    // Insert before closing head tag
    html = html.replace('</head>', `${dataScript}</head>`);
    
    console.log(`📄 Served page with ${sharedData.doublePlays.length || 0} double plays (${(sharedData.doublePlays || []).filter(dp => dp.youtube).length} with YouTube)`);
    res.send(html);
    
  } catch (error) {
    console.error('❌ Error serving page:', error);
    res.status(500).send('Error loading page');
  }
});

// Serve static files for other resources
app.use(express.static(path.join(__dirname, 'dist')));

// Catch-all for other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

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