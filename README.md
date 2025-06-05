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

The application is deployed on a Digital Ocean server and accessible at [podcastjukebox.com](https://podcastjukebox.com).

### Server Setup

1. **Repository and Development Server**:

   - The application is cloned in the home directory
   - Running in development mode using `bun run dev:all`
   - This serves both the frontend and backend

2. **Nginx Configuration**:

   - Nginx is configured as a reverse proxy
   - Forwards requests to the development server
   - Handles SSL termination

3. **Storage Configuration**:

   - The application uses the `PODCASTS_DIR` environment variable to determine where to store generated podcasts
   - In production, this is set to `/var/www/podcastjukebox.com/podcasts`
   - The directory is owned by `www-data:www-data` with permissions `755`
   - All generated podcasts are stored in date-based subdirectories

4. **Storage Setup Commands**:

   ```bash
   # Create storage directory
   ssh root@podcastjukebox.com "mkdir -p /var/www/podcastjukebox.com/podcasts && chown -R www-data:www-data /var/www/podcastjukebox.com/podcasts && chmod -R 755 /var/www/podcastjukebox.com/podcasts"
   ```

5. **Service Management**:

   ```bash
   # Check if the development server is running
   ssh root@podcastjukebox.com "ps aux | grep 'bun run dev:all'"

   # View nginx logs
   ssh root@podcastjukebox.com "tail -f /var/log/nginx/error.log"
   ssh root@podcastjukebox.com "tail -f /var/log/nginx/access.log"

   # Restart nginx
   ssh root@podcastjukebox.com "systemctl restart nginx"
   ```

### Deployment Process

1. Pull the latest changes:

   ```bash
   ssh root@podcastjukebox.com "cd ~/interactive-podcast && git pull"
   ```

2. Install any new dependencies:

   ```bash
   ssh root@podcastjukebox.com "cd ~/interactive-podcast && bun install"
   ```

3. Restart the development server:
   ```bash
   ssh root@podcastjukebox.com "cd ~/interactive-podcast && bun run dev:all"
   ```

### Troubleshooting

1. **Missing Podcasts**:

   - Check if the `podcasts` directory exists and has correct permissions
   - Verify the `PODCASTS_DIR` environment variable is set correctly
   - Check the application logs for any errors

2. **Server Issues**:

   - Check if the development server is running: `ps aux | grep 'bun run dev:all'`
   - Check nginx status: `systemctl status nginx`
   - View nginx logs: `tail -f /var/log/nginx/error.log`

3. **Storage Issues**:

   - Check disk space: `df -h`
   - Verify directory permissions: `ls -la /var/www/podcastjukebox.com/podcasts`
   - Check ownership: `ls -l /var/www/podcastjukebox.com/`

4. **Application Issues**:
   - Check the development server output for errors
   - Verify environment variables are set correctly
   - Check if the application can write to the podcasts directory

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
