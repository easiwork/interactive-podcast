import { fetchAndParseRSS, fetchRSSFeedInfo } from '../server/rss-feed-parser';

async function main() {
  const testFeeds = [
    'https://www.thisamericanlife.org/podcast/rss.xml',
    'https://feeds.npr.org/510289/podcast.xml', // NPR Planet Money
  ];

  for (const feedUrl of testFeeds) {
    console.log(`\nTesting feed: ${feedUrl}`);
    console.log('----------------------------------------');

    try {
      // Get feed-level info
      const feedInfo = await fetchRSSFeedInfo(feedUrl);
      console.log('\nFeed Info:');
      console.log('Title:', feedInfo.title);
      console.log('Feed Image:', feedInfo.imageUrl);
      console.log('Feed Link:', feedInfo.link);

      // Get items with their images
      const items = await fetchAndParseRSS(feedUrl);
      console.log('\nItems:');
      items.slice(0, 2).forEach((item, index) => {
        console.log(`\nItem ${index + 1}:`);
        console.log('Title:', item.title);
        console.log('Episode Image:', item.imageUrl);
        console.log('Thumbnail:', item.thumbnailUrl);
        console.log('Content Type:', item.contentType);
      });
    } catch (error) {
      console.error('Error processing feed:', error);
    }
  }
}

main().catch(console.error); 