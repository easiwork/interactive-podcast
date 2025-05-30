import { getDirectPodcastForPlayback } from "@/server/podcast-generator";
import 'dotenv/config'; // Ensure .env variables are loaded

async function main() {
  const testPodcastFeeds = [
    'https://feeds.megaphone.fm/darknetdiaries',
    'https://feeds.npr.org/510289/podcast.xml' // NPR Planet Money
  ];

  console.log("Testing Direct Podcast Playback Functionality");
  console.log("=============================================\n");

  for (const feedUrl of testPodcastFeeds) {
    console.log(`Testing feed: ${feedUrl}`);
    
    try {
      const result = await getDirectPodcastForPlayback(feedUrl, false);
      
      if (result) {
        console.log("✅ SUCCESS");
        console.log(`   Title: ${result.title}`);
        console.log(`   Audio URL: ${result.audioUrl}`);
        console.log(`   Published: ${result.pubDate || 'Unknown'}`);
        console.log(`   Description length: ${result.description?.length || 0} chars`);
        console.log(`   Episode Image: ${result.imageUrl || 'None'}`);
        console.log(`   Favicon URL: ${result.faviconUrl || 'None'}`);
        console.log(`   Feed Title: ${result.feedInfo?.title || 'Unknown'}`);
        console.log(`   Feed Image: ${result.feedInfo?.imageUrl || 'None'}`);
      } else {
        console.log("❌ FAILED - No audio episodes found");
      }
    } catch (error) {
      console.log(`❌ ERROR - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log("");
  }

  console.log("Test completed!");
}

main(); 