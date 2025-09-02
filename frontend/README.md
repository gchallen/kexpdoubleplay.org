# KEXP Double Play Frontend

A simple React frontend displaying KEXP double plays with KEXP-style design.

## Features

- **KEXP-style playlist display**: Mimics the design of kexp.org/playlist
- **Double album covers**: Shows two copies of the album cover for each double play
- **Real-time data**: Fetches data from https://api.kexpdoubleplays.org/
- **Background refresh capability**: Ready for future YouTube integration
- **Responsive design**: Clean, minimal interface with Tailwind CSS

## Development

Install dependencies:
```bash
bun install
```

Build the application:
```bash
bun run build
```

Start the server:
```bash
bun run dev
# or
bun run start
```

The frontend will be available at http://localhost:8080

## Architecture

- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Express.js** server for static file serving
- **Webpack** for bundling
- **Background data fetching** hooks ready for YouTube integration

## API Integration

The frontend fetches data from the backend API at:
- `https://api.kexpdoubleplays.org/api/double-plays`

The `useDoublePlayData` hook includes background refresh capabilities for future features like YouTube link updates.