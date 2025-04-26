#!/bin/bash

timezone="America/New_York"

# Set the working directory to the project root
cd "$(dirname "$0")/.."

# Get the absolute path to Bun
BUN_PATH=$(which bun)

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Log file for the cron job
LOG_FILE="logs/podcast-generation-$(date +%Y-%m-%d).log"

# Create logs directory if it doesn't exist
mkdir -p logs

# Log the start of the process
echo "Starting podcast generation at $(TZ=$timezone date)" > "$LOG_FILE"

# Run the podcast generation using Bun with absolute path
echo "Running podcast generation..." >> "$LOG_FILE"

"$BUN_PATH" run src/scripts/generate-podcast.ts >> "$LOG_FILE" 2>&1

# Check if the generation was successful
if [ $? -eq 0 ]; then
  echo "Podcast generation completed successfully at $(TZ=$timezone date)" >> "$LOG_FILE"
else
  echo "Podcast generation failed at $(TZ=$timezone date)" >> "$LOG_FILE"
  # You could add notification logic here (email, Slack, etc.)
fi

# Clean up old log files (keep last 7 days)
find logs -name "podcast-generation-*.log" -type f -mtime +7 -delete 