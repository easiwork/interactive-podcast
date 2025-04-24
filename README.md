# Interactive Podcast Generator

An automated system that generates daily podcasts from Hacker News stories using AI. The system extracts articles, generates engaging discussions between two hosts, and creates high-quality audio using ElevenLabs' text-to-speech technology.

## Features

- **Automated Daily Generation**: Creates a new podcast episode every day at 2 PM
- **Hacker News Integration**: Fetches top stories from Hacker News
- **AI-Powered Content**: Uses GPT-4 to generate engaging discussions
- **Natural Voice Synthesis**: Creates realistic host voices using ElevenLabs
- **Seamless Playback**: Combines audio segments into a single podcast file
- **Debug Interface**: Built-in debugging tools for testing and monitoring

## Prerequisites

- Node.js 18+ or Bun
- FFmpeg (for audio processing)
- OpenAI API key
- ElevenLabs API key

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/interactive-podcast.git
   cd interactive-podcast
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Create a `.env` file in the root directory:

   ```
   OPENAI_API_KEY=your_openai_api_key
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ```

4. Set up the cron job for daily generation:
   ```bash
   ./scripts/setup-cron.sh
   ```

## Development

The project consists of two parts: a frontend web application and a backend API server. You'll need to run both for full functionality.

### Frontend Development

Start the frontend development server:

```bash
bun run dev
```

The web application will be available at `http://localhost:5173`.

### Backend Development

Start the backend API server:

```bash
bun run server:dev
```

The API server will be available at `http://localhost:3000`.

### Running Both Servers

For convenience, you can run both servers concurrently:

```bash
bun run dev:all
```

### Debug Interface

Access the debug interface by clicking the "Show Debug" button in the top-right corner. This interface allows you to:

- Generate notes from articles
- Create podcast scripts
- Generate full podcast episodes
- View detailed logs and responses

## Production Deployment

The application is deployed on a Digital Ocean server and accessible at [hackercast.club](https://hackercast.club).

### Server Setup

1. **Static Assets**:

   ```bash
   bun run build-and-copy
   ```

   This builds the frontend assets and copies them to the appropriate directory for Apache to serve.

2. **Backend Server**:

   ```bash
   bun run server:prod
   ```

   The backend API server is managed using PM2:

   ```bash
   pm2 start server:prod
   ```

3. **Web Server**:
   - Apache is configured to serve static assets
   - Reverse proxy configuration routes API requests to the backend server

### Deployment Process

1. Build and copy static assets
2. Restart the backend server using PM2
3. Apache automatically serves the updated static files

## Project Structure

```
.
├── src/
│   ├── server/
│   │   ├── podcast-generator.ts  # Core podcast generation logic
│   │   ├── server.ts            # Express server setup
│   │   └── hacker-news.ts       # HN API integration
│   ├── scripts/
│   │   └── generate-podcast.ts  # CLI script for podcast generation
│   └── App.tsx                  # Main React application
├── scripts/
│   ├── generate-daily-podcast.sh # Daily generation script
│   └── setup-cron.sh            # Cron job setup script
└── podcasts/                    # Generated podcast storage
    └── YYYY-MM-DD/             # Daily podcast directories
```

## How It Works

1. **Story Collection**: Fetches top stories from Hacker News
2. **Article Processing**: Extracts content and generates discussion notes
3. **Script Generation**: Creates a natural conversation between two hosts
4. **Audio Generation**: Converts the script to audio using ElevenLabs
5. **Final Assembly**: Combines audio segments into a single podcast file

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for GPT-4
- ElevenLabs for text-to-speech technology
- Hacker News for the story source
