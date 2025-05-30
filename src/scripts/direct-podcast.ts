import { getDirectPodcastAudio } from "@/server/podcast-generator";
import 'dotenv/config'; // Ensure .env variables are loaded

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const forceRegenerateIndex = args.findIndex(arg => arg === "--force" || arg === "-f");
  const forceRegenerate = forceRegenerateIndex !== -1;
  if (forceRegenerate) {
    args.splice(forceRegenerateIndex, 1); // Remove --force/-f from args
  }

  const rssFeedUrl = args[0];

  if (!rssFeedUrl) {
    console.error("Usage: bun src/scripts/direct-podcast.ts <rssFeedUrl> [--force|-f]");
    console.error("Please provide a podcast RSS feed URL as the first argument.");
    console.error("This script will fetch the latest podcast episode and transcribe it using OpenAI Whisper.");
    process.exit(1);
  }

  console.log(`Fetching direct podcast audio from RSS feed: ${rssFeedUrl}`);
  if (forceRegenerate) {
    console.log("Force regenerate flag detected. Will overwrite existing transcription if it exists.");
  }

  try {
    const result = await getDirectPodcastAudio(rssFeedUrl, forceRegenerate);
    
    if (!result) {
      console.log("No audio episodes found in the RSS feed.");
      process.exit(1);
    }

    console.log("\n=== Direct Podcast Processing Completed ===");
    console.log(`Title: ${result.title}`);
    console.log(`Audio URL: ${result.audioUrl}`);
    console.log(`Published: ${result.pubDate || 'Unknown'}`);
    console.log(`Transcription length: ${result.transcription.length} characters`);
    console.log(`Notes length: ${result.notes.length} characters`);
    console.log("\n=== Transcription Preview (first 500 chars) ===");
    console.log(result.transcription.substring(0, 500) + (result.transcription.length > 500 ? '...' : ''));
    console.log("\n=== Notes Preview (first 500 chars) ===");
    console.log(result.notes.substring(0, 500) + (result.notes.length > 500 ? '...' : ''));
    
    process.exit(0);
  } catch (error) {
    console.error("Failed to process direct podcast:", error);
    process.exit(1);
  }
}

main(); 