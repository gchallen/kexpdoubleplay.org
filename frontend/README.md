# KEXP Double Play Frontend

An Express server-side rendered frontend displaying KEXP double plays with KEXP-style design.

## Features

- **KEXP-style playlist display**: Mimics the design of kexp.org/playlist
- **Double album covers**: Shows two copies of the album cover for each double play
- **YouTube play buttons**: Links to YouTube for tracks with known video IDs
- **Real-time data**: Fetches data from https://api.kexpdoubleplays.org/
- **Background refresh**: Periodically refreshes data from the backend API
- **Dark mode**: Cookie-based theme toggle

## Development

Start the server:
```bash
node server.js
```

The frontend will be available at http://localhost:8080

## Architecture

- **Express.js** server with server-side HTML templating (`template.html`)
- **Vanilla JavaScript** (no build step, no framework)
- **Server-side rendering**: HTML is generated on each request from template + backend data
- **Background data fetching**: Periodically pulls from the backend API

## API Integration

The frontend fetches data from the backend API at:
- `https://api.kexpdoubleplays.org/api/double-plays`

Data is cached in memory and refreshed every 5 minutes.
