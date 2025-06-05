import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X, Search, ChevronDown, ChevronRight, Star } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const getApiBaseUrl = () => {
  if (process.env.NODE_ENV === "development") {
    // In development, check if we're accessing via domain or localhost
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "podcastjukebox.com"
    ) {
      return "/api"; // Use Vite proxy
    }
    return "http://localhost:3000/api";
  }
  return "/api";
};

const API_BASE_URL = getApiBaseUrl();

export interface Source {
  id: string;
  name: string;
  url: string;
  description: string;
  category?: string;
  isCustom?: boolean;
  isProcessing?: boolean;
  imageUrl?: string;
}

function getFaviconUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=32`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=32`;
  }
}

// Group sources by category
const categories = {
  "Custom Feeds": [], // This will be populated with custom feeds
  "News & Politics": ["daily", "upfirst", "npr"],
  Technology: ["lexfridman", "darknet", "hackernews"],
  Business: ["planetmoney", "freakonomics", "howimade", "marketplace"],
  Science: ["radiolab", "sciencefriday", "huberman", "maintenance"],
  Culture: ["thisamericanlife", "hiddenbrain", "invisibilia", "accented"],
  "Design & Innovation": ["99percent"],
};

export const defaultSources: Source[] = [
  {
    id: "hackernews",
    name: "Hacker News",
    url: "https://news.ycombinator.com/rss",
    description: "Latest stories from Hacker News",
    category: "Technology",
  },
  {
    id: "npr",
    name: "NPR News",
    url: "https://feeds.npr.org/1001/rss.xml",
    description: "Latest news from NPR",
    category: "News & Politics",
  },
  {
    id: "daily",
    name: "The Daily",
    url: "https://feeds.simplecast.com/54nAGcIl",
    description:
      "The biggest stories of our time, told by the best journalists in the world",
    category: "News & Politics",
  },
  {
    id: "ologies",
    name: "Ologies with Alie Ward",
    url: "https://feeds.simplecast.com/FO6kxYGj",
    description:
      'A science podcast for people who would never listen to a science podcast. Hosted by Alie Ward, each episode dives into a different "-ology" with expert guests.',
    category: "Even more Science & Curiosity",
  },
  {
    id: "gastropod",
    name: "Gastropod",
    url: "https://feeds.megaphone.fm/VMP6255701211",
    description:
      "Gastropod looks at food through the lens of science and history. Hosted by Cynthia Graber and Nicola Twilley, it's like Radiolab for your dinner plate.",
    category: "Even more Science & Curiosity",
  },
  {
    id: "upfirst",
    name: "Up First",
    url: "https://feeds.npr.org/510318/podcast.xml",
    description: "NPR's morning news podcast",
    category: "News & Politics",
  },
  {
    id: "lexfridman",
    name: "Lex Fridman Podcast",
    url: "https://lexfridman.com/feed/podcast/",
    description:
      "Conversations about science, technology, history, philosophy and the nature of intelligence",
    category: "Technology",
  },
  {
    id: "darknet",
    name: "Darknet Diaries",
    url: "https://feeds.megaphone.fm/darknetdiaries",
    description: "True stories from the dark side of the Internet",
    category: "Technology",
  },
  {
    id: "planetmoney",
    name: "Planet Money",
    url: "https://feeds.npr.org/510289/podcast.xml",
    description: "The economy explained",
    category: "Business",
  },
  {
    id: "freakonomics",
    name: "Freakonomics Radio",
    url: "https://feeds.simplecast.com/54nAGcIl",
    description: "Discover the hidden side of everything",
    category: "Business",
  },
  {
    id: "radiolab",
    name: "Radiolab",
    url: "https://feeds.simplecast.com/EmVW7VGp",
    description: "Investigating a strange world",
    category: "Science & Curiosity",
  },
  {
    id: "sciencefriday",
    name: "Science Friday",
    url: "https://feeds.simplecast.com/54nAGcIl",
    description:
      "Covering the outer reaches of space to the tiniest microbes in our bodies",
    category: "Science & Curiosity",
  },
  {
    id: "huberman",
    name: "Huberman Lab",
    url: "https://feeds.megaphone.fm/hubermanlab",
    description: "Neuroscience and health",
    category: "Science & Curiosity",
  },
  {
    id: "maintenance",
    name: "Maintenance Phase",
    url: "https://feeds.buzzsprout.com/1411126.rss",
    description: "Debunking the junk science behind health fads",
    category: "Science & Curiosity",
  },
  {
    id: "hiddenbrain",
    name: "Hidden Brain",
    url: "https://feeds.simplecast.com/kwWc0lhf",
    description: "Science and storytelling",
    category: "Culture",
  },
  {
    id: "invisibilia",
    name: "Invisibilia",
    url: "https://feeds.npr.org/510307/podcast.xml",
    description: "Unseeable forces that control human behavior",
    category: "Culture",
  },
  {
    id: "accented",
    name: "Accented",
    url: "https://feeds.buzzsprout.com/586573.rss",
    description: "Stories about language and identity",
    category: "Culture",
  },
  {
    id: "99percent",
    name: "99% Invisible",
    url: "https://feeds.simplecast.com/BqbsxVfO",
    description: "Design is everywhere in our lives",
    category: "Design & Innovation",
  },
  {
    id: "howimade",
    name: "How I Built This",
    url: "https://rss.art19.com/how-i-built-this",
    description: "Stories behind some of the world's best known companies",
    category: "Business",
  },
  {
    id: "marketplace",
    name: "Marketplace",
    url: "https://feeds.publicradio.org/public_feeds/marketplace",
    description: "Business news and economic analysis",
    category: "Business",
  },
];

interface SourceSelectorProps {
  sources: Source[];
  selectedSource: Source;
  onSourceChange: (source: Source) => void;
  onAddCustomSource: (url: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

export function SourceSelector({
  sources,
  selectedSource,
  onSourceChange,
  onAddCustomSource,
  onKeyDown,
}: SourceSelectorProps) {
  const [showSearchSection, setShowSearchSection] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchType, setSearchType] = useState<"url" | "podcast" | "website">(
    "url"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    Object.keys(categories)
  );
  const [processingFeeds, setProcessingFeeds] = useState<Set<string>>(
    new Set()
  );
  const [starredFeeds, setStarredFeeds] = useState<Set<string>>(() => {
    // Initialize with default starred feeds
    const defaultStarred = new Set(["hackernews", "gastropod", "npr"]);
    // Load any previously starred feeds from localStorage
    const saved = localStorage.getItem("starredFeeds");
    if (saved) {
      const parsed = JSON.parse(saved);
      return new Set([...defaultStarred, ...parsed]);
    }
    return defaultStarred;
  });
  const isMobile = useIsMobile();

  // Save starred feeds to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("starredFeeds", JSON.stringify([...starredFeeds]));
  }, [starredFeeds]);

  const handleSearchSubmit = async () => {
    if (searchInput.trim()) {
      const newFeedId = `custom-${Date.now()}`;
      setProcessingFeeds((prev) => new Set([...prev, newFeedId]));

      try {
        if (searchType === "url") {
          await onAddCustomSource(searchInput.trim());
        }
        // TODO: Add podcast directory search and website search
      } finally {
        setProcessingFeeds((prev) => {
          const next = new Set(prev);
          next.delete(newFeedId);
          return next;
        });
      }

      setSearchInput("");
      setShowSearchSection(false);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLDivElement>
  ) => {
    if (e.key === "Enter" && showSearchSection) {
      handleSearchSubmit();
    } else if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const toggleStar = (feedId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent feed selection when clicking star
    setStarredFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(feedId)) {
        next.delete(feedId);
      } else {
        next.add(feedId);
      }
      return next;
    });
  };

  const filteredSources = sources.filter((source) => {
    const matchesSearch =
      searchQuery === "" ||
      source.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const groupedSources = filteredSources.reduce(
    (acc, source) => {
      const category = source.isCustom
        ? "Custom Feeds"
        : source.category || "Uncategorized";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(source);
      return acc;
    },
    {} as Record<string, Source[]>
  );

  // Get starred sources
  const starredSources = sources.filter((source) =>
    starredFeeds.has(source.id)
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Select Source</Label>
            {!showSearchSection && !isMobile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSearchSection(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Search
              </Button>
            )}
          </div>

          {showSearchSection ? (
            <div className="space-y-2">
              <div className="flex space-x-2">
                <Button
                  variant={searchType === "url" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSearchType("url")}
                  className="flex-1"
                >
                  RSS/Feed URL
                </Button>
                <Button
                  variant={searchType === "podcast" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSearchType("podcast")}
                  className="flex-1"
                  disabled
                  title="Coming soon"
                >
                  Podcast Directory
                </Button>
                <Button
                  variant={searchType === "website" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSearchType("website")}
                  className="flex-1"
                  disabled
                  title="Coming soon"
                >
                  Website
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Input
                  placeholder={
                    searchType === "url"
                      ? "Enter RSS feed URL"
                      : searchType === "podcast"
                        ? "Search podcast directory..."
                        : "Enter website URL"
                  }
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowSearchSection(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={handleSearchSubmit}
                disabled={!searchInput.trim()}
              >
                {searchType === "url" ? "Add Feed" : "Search"}
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search feeds..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>

              {/* Your Content Section */}
              {starredSources.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg font-semibold">
                      Your Content
                    </Label>
                  </div>
                  <div className="space-y-1">
                    {starredSources.map((source) => (
                      <div
                        key={source.id}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-50 ${
                          selectedSource.id === source.id ? "bg-gray-100" : ""
                        }`}
                        onClick={() => onSourceChange(source)}
                      >
                        <div className="flex items-center space-x-2">
                          {source.imageUrl ? (
                            <img
                              src={source.imageUrl}
                              alt={source.name}
                              className="w-6 h-6 rounded"
                            />
                          ) : (
                            <img
                              src={getFaviconUrl(source.url)}
                              alt={source.name}
                              className="w-6 h-6 rounded"
                            />
                          )}
                          <div>
                            <div className="font-medium">{source.name}</div>
                            <div className="text-sm text-gray-500">
                              {source.description}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-yellow-500 hover:text-yellow-600"
                          onClick={(e) => toggleStar(source.id, e)}
                        >
                          <Star className="h-4 w-4 fill-current" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Sources Section */}
              <div className="space-y-2">
                {Object.entries(groupedSources).map(([category, sources]) => (
                  <Collapsible
                    key={category}
                    open={expandedCategories.includes(category)}
                    onOpenChange={() => toggleCategory(category)}
                  >
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                        <div className="flex items-center">
                          {expandedCategories.includes(category) ? (
                            <ChevronDown className="h-4 w-4 mr-2" />
                          ) : (
                            <ChevronRight className="h-4 w-4 mr-2" />
                          )}
                          <span className="font-medium">{category}</span>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pl-6 space-y-1">
                        {sources.map((source) => (
                          <div
                            key={source.id}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-50 ${
                              selectedSource.id === source.id
                                ? "bg-gray-100"
                                : ""
                            }`}
                            onClick={() => onSourceChange(source)}
                          >
                            <div className="flex items-center space-x-2">
                              {source.imageUrl ? (
                                <img
                                  src={source.imageUrl}
                                  alt={source.name}
                                  className="w-6 h-6 rounded"
                                />
                              ) : (
                                <img
                                  src={getFaviconUrl(source.url)}
                                  alt={source.name}
                                  className="w-6 h-6 rounded"
                                />
                              )}
                              <div>
                                <div className="font-medium">{source.name}</div>
                                <div className="text-sm text-gray-500">
                                  {source.description}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 ${
                                starredFeeds.has(source.id)
                                  ? "text-yellow-500 hover:text-yellow-600"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                              onClick={(e) => toggleStar(source.id, e)}
                            >
                              <Star
                                className={`h-4 w-4 ${
                                  starredFeeds.has(source.id)
                                    ? "fill-current"
                                    : ""
                                }`}
                              />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
