const express = require('express');
const path = require('path');
const fs = require('fs');

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

// Shared application state
let sharedData = {
  doublePlays: [],
  lastBackendFetch: null,
  totalCount: 0,
  metadata: {},
  retrievalStatus: 'loading'
};

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

    // Update shared state with backend data (YouTube data already included)
    sharedData = {
      doublePlays: backendData.doublePlays,
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

// Background task to periodically refresh data
async function startBackgroundTasks() {
  console.log('⚙️  Starting background tasks...');
  
  // Fetch fresh data every 5 minutes
  setInterval(async () => {
    console.log('🔄 Periodic backend data fetch...');
    await fetchBackendData();
  }, 5 * 60 * 1000);
  
  console.log('✅ Background tasks started');
}

// Status endpoint
app.get('/api/status', (req, res) => {
  const status = {
    status: 'running',
    frontendUptime: process.uptime(),
    lastBackendFetch: sharedData.lastBackendFetch,
    totalDoublePlays: sharedData.totalCount,
    retrievalStatus: sharedData.retrievalStatus,
    timestamp: new Date().toISOString()
  };
  
  res.json(status);
});

// Main page route
app.get('/', async (req, res) => {
  try {
    const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
    
    // Get theme preference from cookie
    const cookies = req.headers.cookie || '';
    const themeMatch = cookies.match(/theme=([^;]+)/);
    const isDarkMode = themeMatch && themeMatch[1] === 'dark';
    
    // Theme classes and icon visibility
    const themeClass = isDarkMode ? 'dark' : '';
    const sunDisplay = isDarkMode ? 'block' : 'none';
    const moonDisplay = isDarkMode ? 'none' : 'block';
    
    // Generate status text
    const youtubeCount = sharedData.doublePlays.filter(dp => dp.youtube).length;
    const statusText = `Showing ${sharedData.doublePlays.length} double plays${youtubeCount > 0 ? ` (${youtubeCount} with YouTube links)` : ''} • Last updated: ${sharedData.lastBackendFetch ? new Date(sharedData.lastBackendFetch).toLocaleString() : 'Never'}`;
    
    // Generate HTML for each double play
    const doublePlayHtml = sharedData.doublePlays.map((doublePlay, index) => {
      const firstPlay = doublePlay.plays[0];
      const trackNumber = index + 1;
      
      // YouTube play button (if available from backend)
      const playButton = doublePlay.youtube 
        ? `<div class="play-button">
             <a href="${doublePlay.youtube.url}" target="_blank" rel="noopener" title="Play on YouTube">
               <svg viewBox="0 0 24 24">
                 <polygon class="fill-black" points="5,3 19,12 5,21"></polygon>
               </svg>
             </a>
           </div>`
        : `<div class="play-button invisible"></div>`;
      
      // Album covers
      const albumCovers = doublePlay.plays
        .filter(play => play.kexpPlay.image_uri)
        .slice(0, 2)
        .map(play => 
          `<div class="album-cover-container">
             <img src="${play.kexpPlay.image_uri}" 
                  alt="Album cover" 
                  class="album-cover" 
                  loading="lazy">
           </div>`
        ).join('');
      
      return `
        <div class="playlist-item">
          <div class="item-content">
            <div class="track-number">${trackNumber}</div>
            ${playButton}
            <div class="timestamp">${new Date(firstPlay.timestamp).toLocaleString()}</div>
            <div class="track-info">
              <div class="track-line">
                <span class="track-title">${doublePlay.title}</span>
                <span class="artist-name">by ${doublePlay.artist}</span>
                ${firstPlay.kexpPlay.album ? `<span class="release-year">(${firstPlay.kexpPlay.album})</span>` : ''}
              </div>
              <div class="show-dj-line">
                ${doublePlay.dj ? `<span class="dj-name">${doublePlay.dj}</span>` : ''}
                ${doublePlay.dj && doublePlay.show ? `<span class="separator"> • </span>` : ''}
                ${doublePlay.show ? `<span class="show-name">${doublePlay.show}</span>` : ''}
              </div>
            </div>
            <div class="album-covers">
              ${albumCovers}
            </div>
          </div>
        </div>`;
    }).join('');
    
    // Replace template variables
    const html = template
      .replace('{{THEME_CLASS}}', themeClass)
      .replace('{{SUN_DISPLAY}}', sunDisplay)
      .replace('{{MOON_DISPLAY}}', moonDisplay)
      .replace('{{STATUS_TEXT}}', statusText)
      .replace('{{DOUBLE_PLAYS_HTML}}', doublePlayHtml);
    
    const totalWithYoutube = sharedData.doublePlays.filter(dp => dp.youtube).length;
    console.log(`📄 Served page with ${sharedData.doublePlays.length} double plays (${totalWithYoutube} with YouTube)`);
    
    res.send(html);
    
  } catch (error) {
    console.error('❌ Error serving page:', error.message);
    res.status(500).send('Error loading page');
  }
});

// Static files
app.use(express.static('public'));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Frontend server running on port ${PORT}`);
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