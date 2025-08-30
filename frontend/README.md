# KEXP Double Play Scanner - Frontend

Next.js frontend application for viewing KEXP double play data in a beautiful KEXP-style playlist interface.

## Features

- **KEXP-Inspired Design**: Clean, minimalist playlist layout matching KEXP's aesthetic
- **Album Artwork**: Displays duplicate album covers side-by-side for double plays
- **Real-time Updates**: Live data from the backend API
- **Responsive Design**: Works on mobile and desktop
- **Filter & Search**: Find double plays by artist, DJ, or show

## Quick Start

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Build & Deploy

```bash
# Build for production
npm run build

# Start production server
npm start

# Static export (for Vercel/Netlify)
npm run export
```

## Environment Variables

Create `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

## Design System

The frontend uses KEXP's design language:
- **Typography**: System sans-serif fonts for readability
- **Colors**: Black/white primary palette with subtle grays  
- **Layout**: Grid-based, card-style presentation
- **Focus**: Clean data presentation with album artwork prominence

## API Integration

Connects to backend endpoints:
- `/api/double-plays` - Fetch legitimate double plays
- `/api/health` - Scanner status
- `/api/stats` - Analytics data

## Deployment

Optimized for deployment on Vercel with automatic builds from the frontend workspace.