#!/bin/bash

# Get the absolute path to the generate-daily-podcast.sh script
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/generate-daily-podcast.sh"

# Get the absolute path to Bun
BUN_PATH=$(which bun)
ELEVEN_LABS_API_KEY=$ELEVEN_LABS_API_KEY
OPENAI_API_KEY=$OPENAI_API_KEY

# Make the script executable
chmod +x "$SCRIPT_PATH"

# Create a temporary file for the new crontab
TEMP_CRONTAB=$(mktemp)

# Export current crontab
crontab -l > "$TEMP_CRONTAB" 2>/dev/null || echo "" > "$TEMP_CRONTAB"

# Check if the cron job already exists
if grep -q "$SCRIPT_PATH" "$TEMP_CRONTAB"; then
  echo "Cron job already exists."
  
  # Ask if user wants to overwrite
  read -p "Do you want to overwrite the existing cron job? (y/n): " OVERWRITE
  
  if [[ "$OVERWRITE" == "y" || "$OVERWRITE" == "Y" ]]; then
    # Remove the existing cron job
    sed -i "\|$SCRIPT_PATH|d" "$TEMP_CRONTAB"
    echo "Existing cron job removed."
  else
    echo "Keeping existing cron job. Exiting."
    rm "$TEMP_CRONTAB"
    exit 0
  fi
fi

# Add the new cron job to run at 2:00 PM EDT (6:00 PM UTC)
echo "45 17 * * * BUN_PATH=\"$BUN_PATH\" ELEVEN_LABS_API_KEY=\"$ELEVEN_LABS_API_KEY\" OPENAI_API_KEY=\"$OPENAI_API_KEY\" $SCRIPT_PATH" >> "$TEMP_CRONTAB"

# Install the new crontab
crontab "$TEMP_CRONTAB"

echo "Cron job has been set up successfully."
echo "The podcast will be generated daily at 1:45 PM EDT (6:00 PM UTC)."

# Clean up
rm "$TEMP_CRONTAB" 