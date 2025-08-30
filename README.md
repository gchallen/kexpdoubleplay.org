# KEXP Double Play Scanner

A comprehensive system for detecting and displaying double plays from KEXP radio station playlist data.

## Architecture

This project uses a **multi-workspace architecture**:

- **`backend/`** - Node.js/TypeScript API service with scanner logic
- **`frontend/`** - Next.js React application with KEXP-style UI

## Features

### Backend
- **Real-time Scanning**: Continuous monitoring of KEXP playlist
- **Smart Detection**: Album-aware matching prevents false positives
- **REST API**: Comprehensive endpoints with runtime validation
- **Health Monitoring**: Tracks API status and scanning progress
- **Backup System**: GitHub-based data backup and recovery
- **Docker Support**: Multi-platform containerization

### Frontend  
- **KEXP-Style Design**: Clean playlist interface with duplicate album artwork
- **Live Updates**: Real-time double play discovery
- **Mobile Responsive**: Beautiful design across devices
- **Advanced Filtering**: Search by artist, DJ, show, or date

## Quick Start

### Backend (Scanner + API)
```bash
cd backend
bun install
bun dev
```

### Frontend (Web UI)
```bash
cd frontend  
bun install
bun dev
```

### Full Development
```bash
# Install all workspaces
bun install

# Run backend
bun backend

# Run frontend (separate terminal)
bun frontend
```

## What are Double Plays?

A **double play** occurs when KEXP plays the exact same track (same artist, song, and album) consecutively. The scanner analyzes KEXP's live playlist data to detect these rare events.

### Classification System
- **Legitimate**: Intentional double plays with similar durations (≤10% difference)
- **Partial**: Track restarted due to technical issues (>10% duration difference) 
- **Mistake**: Accidental plays (very short first play <30 seconds)

## Deployment

### Backend (Docker)
```bash
cd backend
docker build -t geoffreychallen/kexp-doubleplay-backend:latest .
docker run -p 3000:3000 geoffreychallen/kexp-doubleplay-backend:latest
```

### Frontend (Vercel)
The frontend is optimized for deployment on Vercel with automatic builds.

## Development

See individual workspace READMEs for detailed development instructions:
- `backend/README.md` - API service development  
- `frontend/README.md` - React application development

## License

ISC