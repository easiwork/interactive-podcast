declare module 'rss-parser' {
  interface CustomItem {
    title?: string;
    link?: string;
    content?: string;
    contentSnippet?: string;
    pubDate?: string;
    enclosure?: {
      url?: string;
      type?: string;
      length?: string;
    };
    mediaContent?: {
      $?: {
        url?: string;
        type?: string;
        length?: string;
      };
    };
    duration?: string;
    itunesImage?:
      | string
      | { href?: string; url?: string }
      | { $?: { href?: string } };
    mediaThumbnail?: string | { url?: string; $?: { url?: string } };
    itemImage?: string | { url?: string; href?: string };
    mediaGroup?: {
      'media:content'?: {
        $?: {
          url?: string;
          type?: string;
          length?: string;
        };
      } | Array<{
        $?: {
          url?: string;
          type?: string;
          length?: string;
        };
      }>;
    };
  }

  interface CustomFeed {
    title?: string;
    description?: string;
    link?: string;
    items: CustomItem[];
    itunesImage?:
      | string
      | { href?: string; url?: string }
      | { $?: { href?: string } };
    feedImage?: string | { url?: string; href?: string };
    'itunes:author'?: string;
    'itunes:summary'?: string;
    'itunes:explicit'?: string;
    'itunes:category'?: string[];
    'itunes:owner'?: {
      name?: string;
      email?: string;
    };
  }

  interface ParserOptions {
    customFields?: {
      item?: [string, string][];
      feed?: [string, string][];
    };
  }

  class Parser {
    constructor(options?: ParserOptions);
    parseURL(url: string): Promise<CustomFeed>;
  }

  export default Parser;
} 