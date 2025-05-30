import { generateFullPodcast } from "@/server/podcast-generator";
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
    console.error("Usage: bun src/scripts/generate-podcast.ts <rssFeedUrl> [--force|-f]");
    console.error("Please provide an RSS feed URL as the first argument.");
    console.error("The script will automatically determine whether to collect 1 item (podcast feeds) or 5 items (news/text feeds).");
    process.exit(1);
  }

  console.log(`Starting podcast generation for RSS feed: ${rssFeedUrl}`);
  console.log("Feed type will be auto-detected: podcast feeds (1 item) vs news/text feeds (5 items)");
  if (forceRegenerate) {
    console.log(
      "Force regenerate flag detected. Will overwrite existing podcast if it exists."
    );
  }

  try {
    // Call generateFullPodcast with rssFeedUrl and forceRegenerate (maxItems now auto-determined)
    await generateFullPodcast(rssFeedUrl, forceRegenerate);
    console.log("Podcast generation completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Failed to generate podcast:", error);
    process.exit(1);
  }
}

main();
