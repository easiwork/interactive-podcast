import Parser from "rss-parser";
import { ArticleData } from "@extractus/article-extractor";

export interface FeedItem {
  title?: string;
  link?: string;
  content?: string;
  pubDate?: string;
  audioUrl?: string;
  contentType: "text" | "audio";
  imageUrl?: string;
  thumbnailUrl?: string;
  enclosure?: {
    url?: string;
    type?: string;
    length?: string;
    imageUrl?: string;
  };
  itunes?: {
    image?: string;
    duration?: string;
  };
}

export interface FeedInfo {
  title?: string;
  link?: string;
  description?: string;
  imageUrl?: string;
  itunes?: {
    image?: string;
    author?: string;
    summary?: string;
    explicit?: string;
    categories?: string[];
    owner?: {
      name?: string;
      email?: string;
    };
  };
}

const parser = new Parser({
  customFields: {
    item: [
      ["enclosure", "enclosure"],
      ["itunes:duration", "duration"],
      ["media:content", "mediaContent"],
      ["itunes:image", "itunesImage"],
      ["media:thumbnail", "mediaThumbnail"],
      ["image", "itemImage"],
      ["media:group", "mediaGroup"],
    ],
    feed: [
      ["itunes:image", "itunesImage"],
      ["image", "feedImage"],
    ],
  },
});

export async function fetchAndParseRSS(feedUrl: string): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(feedUrl);

    return feed.items.map((item) => {
      // Check if this is an audio item
      const enclosure = item.enclosure;
      const mediaContent = item["mediaContent"];

      // Determine if this is an audio item based on enclosure or media:content
      const isAudioItem =
        enclosure?.type?.startsWith("audio/") ||
        mediaContent?.$?.type?.startsWith("audio/");

      const audioUrl = isAudioItem
        ? enclosure?.url || mediaContent?.$?.url
        : undefined;

      // Extract image information
      let imageUrl: string | undefined;
      let thumbnailUrl: string | undefined;

      // Try different image sources in order of preference
      if (item["itunesImage"]) {
        const itunesImg = item["itunesImage"];
        if (typeof itunesImg === "string") {
          imageUrl = itunesImg;
        } else if (Array.isArray(itunesImg)) {
          const firstImg = itunesImg[0];
          if (typeof firstImg === "string") {
            imageUrl = firstImg;
          } else if (firstImg && typeof firstImg === "object") {
            // Handle itunes:image with href attribute
            if ("href" in firstImg && firstImg.href) {
              imageUrl = firstImg.href;
            } else if ("url" in firstImg && firstImg.url) {
              imageUrl = firstImg.url;
            } else if ("$" in firstImg && firstImg.$ && firstImg.$.href) {
              imageUrl = firstImg.$.href;
            }
          }
        } else if (itunesImg && typeof itunesImg === "object") {
          // Handle itunes:image with href attribute
          if ("href" in itunesImg && itunesImg.href) {
            imageUrl = itunesImg.href;
          } else if ("url" in itunesImg && itunesImg.url) {
            imageUrl = itunesImg.url;
          } else if ("$" in itunesImg && itunesImg.$ && itunesImg.$.href) {
            imageUrl = itunesImg.$.href;
          }
        }
      }

      // Check media:group for images (common in some podcast feeds)
      if (!imageUrl && item["mediaGroup"]) {
        const mediaGroup = item["mediaGroup"];
        if (mediaGroup["media:content"]) {
          const mediaContent = Array.isArray(mediaGroup["media:content"])
            ? mediaGroup["media:content"][0]
            : mediaGroup["media:content"];

          if (mediaContent?.$?.url) {
            imageUrl = mediaContent.$.url;
          }
        }
      }

      if (item["mediaThumbnail"]) {
        const thumbnail = item["mediaThumbnail"];
        thumbnailUrl =
          typeof thumbnail === "string"
            ? thumbnail
            : thumbnail?.url || thumbnail?.$?.url;
      }

      if (item["itemImage"]) {
        const itemImg = item["itemImage"];
        if (!imageUrl) {
          imageUrl =
            typeof itemImg === "string"
              ? itemImg
              : itemImg?.url || itemImg?.href;
        }
      }

      return {
        title: item.title,
        link: item.link,
        content: item.content || item.contentSnippet,
        pubDate: item.pubDate,
        audioUrl,
        contentType: isAudioItem ? "audio" : "text",
        imageUrl,
        thumbnailUrl,
        itunes: {
          image: imageUrl, // Store the iTunes image URL in the itunes object
          duration: item.duration,
        },
      };
    });
  } catch (error) {
    console.error("Error parsing RSS feed:", error);
    throw new Error(
      `Failed to parse RSS feed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function fetchRSSFeedInfo(feedUrl: string): Promise<FeedInfo> {
  try {
    const feed = await parser.parseURL(feedUrl);

    // Extract feed-level image
    let feedImageUrl: string | undefined;

    if (feed["itunesImage"]) {
      const itunesImg = feed["itunesImage"];
      if (typeof itunesImg === "string") {
        feedImageUrl = itunesImg;
      } else if (itunesImg && typeof itunesImg === "object") {
        // Handle itunes:image with href attribute
        if ("href" in itunesImg && itunesImg.href) {
          feedImageUrl = itunesImg.href;
        } else if ("url" in itunesImg && itunesImg.url) {
          feedImageUrl = itunesImg.url;
        } else if ("$" in itunesImg && itunesImg.$ && itunesImg.$.href) {
          feedImageUrl = itunesImg.$.href;
        }
      }
    }

    if (!feedImageUrl && feed["feedImage"]) {
      const feedImg = feed["feedImage"];
      feedImageUrl =
        typeof feedImg === "string" ? feedImg : feedImg?.url || feedImg?.href;
    }

    // Extract domain for favicon fallback
    let feedLink = feed.link;
    if (!feedLink && feedUrl) {
      try {
        const url = new URL(feedUrl);
        feedLink = `${url.protocol}//${url.hostname}`;
      } catch {
        feedLink = feedUrl;
      }
    }

    return {
      title: feed.title,
      description: feed.description,
      imageUrl: feedImageUrl,
      link: feedLink,
      itunes: {
        image: feedImageUrl, // Store the iTunes image URL in the itunes object
        author: feed["itunes:author"],
        summary: feed["itunes:summary"],
        explicit: feed["itunes:explicit"],
        categories: feed["itunes:category"],
        owner: feed["itunes:owner"],
      },
    };
  } catch (error) {
    console.error("Error parsing RSS feed info:", error);
    throw new Error(
      `Failed to parse RSS feed info: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
