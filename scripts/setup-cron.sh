#!/bin/bash

# Get the absolute path to the generate-daily-podcast.sh script
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/generate-daily-podcast.sh"

# Get the absolute path to Bun
BUN_PATH=$(which bun)

# Make the script executable
chmod +x "$SCRIPT_PATH"

# Create a temporary file for the new crontab
TEMP_CRONTAB=$(mktemp)

# Export current crontab
crontab -l > "$TEMP_CRONTAB" 2>/dev/null || echo "" > "$TEMP_CRONTAB"

# Check if the cron job already exists
if ! grep -q "$SCRIPT_PATH" "$TEMP_CRONTAB"; then
  # Add the new cron job to run at 2 PM daily
  echo "0 14 * * * BUN_PATH=\"$BUN_PATH\" $SCRIPT_PATH" >> "$TEMP_CRONTAB"
  
  # Install the new crontab
  crontab "$TEMP_CRONTAB"
  
  echo "Cron job has been set up successfully."
  echo "The podcast will be generated daily at 2:00 PM."
else
  echo "Cron job already exists."
fi

# Clean up
rm "$TEMP_CRONTAB" 