import { generateFullPodcast } from "@/server/podcast-generator";

async function main() {
  console.log("Starting daily podcast generation...");
  try {
    await generateFullPodcast();
    console.log("Daily podcast generation completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Failed to generate daily podcast:", error);
    process.exit(1);
  }
}

main();
