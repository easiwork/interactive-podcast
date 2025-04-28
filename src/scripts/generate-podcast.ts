import { generateFullPodcast } from "@/server/podcast-generator";

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const forceRegenerate = args.includes("--force") || args.includes("-f");

  console.log("Starting daily podcast generation...");
  if (forceRegenerate) {
    console.log(
      "Force regenerate flag detected. Will overwrite existing podcast if it exists."
    );
  }

  try {
    await generateFullPodcast(5, forceRegenerate);
    console.log("Daily podcast generation completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Failed to generate daily podcast:", error);
    process.exit(1);
  }
}

main();
