import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HackerNewsSummary } from "@/components/HackerNewsSummary";
import { fetchHNStory, Story } from "./components/hacker-news-api";
import { fetchHNTopStories } from "./components/hacker-news-api";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Mic,
  X,
  ChevronLeft,
  ChevronRight,
  Link,
} from "lucide-react";
import { useRealtimeSession } from "./components/useRealtimeSession";
import { DebugPage } from "./components/DebugPage";
import { realtimePrompt } from "./realtime-prompt";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SourceSelector,
  Source,
  defaultSources,
} from "./components/SourceSelector";
import DOMPurify from "dompurify";

const NUM_STORIES = 10;
const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:3000/api" : "api";

interface StoryMetadata extends Story {
  expanded: boolean;
}

interface PodcastMetadata {
  script: string;
  audioFile: string;
  notes: string[];
  stories: Story[];
  isDirectPlayback?: boolean;
  directPlaybackInfo?: {
    title: string;
    audioUrl: string;
    pubDate?: string;
    description?: string;
    imageUrl?: string;
    faviconUrl?: string;
    feedInfo?: {
      title?: string;
      imageUrl?: string;
      link?: string;
      itunes?: { image?: string };
    };
  };
  feedItems?: Array<{
    title: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    link?: string;
    enclosure?: { imageUrl?: string };
    itunes?: { image?: string };
  }>;
}

interface FeedInfo {
  title: string;
  audioUrl: string;
  pubDate: string;
  description: string;
  imageUrl?: string;
  feedInfo?: {
    title?: string;
    imageUrl?: string;
    link?: string;
    itunes?: { image?: string };
  };
}

interface SourceSelectorProps {
  sources: Source[];
  selectedSource: Source;
  onSourceChange: (source: Source) => void;
  onAddCustomSource: (url: string) => Promise<void>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

interface DirectPlaybackInfo {
  title: string;
  audioUrl: string;
  pubDate?: string;
  description?: string;
  imageUrl?: string;
  faviconUrl?: string;
  feedInfo?: {
    title?: string;
    imageUrl?: string;
    link?: string;
    itunes?: {
      image?: string;
    };
  };
  feedItems?: Array<{
    title: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    link?: string;
    enclosure?: { imageUrl?: string };
    itunes?: { image?: string };
  }>;
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

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [timestamp, setTimestamp] = useState(0);
  const [aiActive, setAiActive] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [podcastMetadata, setPodcastMetadata] =
    useState<PodcastMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { startSession, stopSession, isSessionActive, updateSession } =
    useRealtimeSession();
  const [sources, setSources] = useState<Source[]>(defaultSources);
  const [selectedSource, setSelectedSource] = useState<Source>(
    defaultSources[0]
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [podcastUrl, setPodcastUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPodcastFeed, setIsPodcastFeed] = useState(false);
  const [feedTitle, setFeedTitle] = useState<string>("");
  const [processedFeeds, setProcessedFeeds] = useState<
    Record<string, PodcastMetadata>
  >({});
  const descriptionRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [mobilePlayerOpen, setMobilePlayerOpen] = useState(false);
  const [hostNames, setHostNames] = useState<string[]>(["Roshan", "Nathaniel"]);

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const getPodcastTitle = () => {
    return "Podcast Jukebox";
  };

  function getSourceId(source: Source) {
    if (source.id === "hackernews") return "https___news_ycombinator_com_rss";
    if (source.id === "npr") return "https___feeds_npr_org_1001_rss_xml";
    return source.url.replace(/[^a-zA-Z0-9]/g, "_");
  }

  const processFeed = async (source: Source) => {
    try {
      console.log("Processing feed:", source.url);
      const response = await fetch(`${API_BASE_URL}/generate-podcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rssFeedUrl: source.url,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate podcast");
      }

      const data = await response.json();
      console.log("Feed processed:", data);

      setProcessedFeeds((prev) => ({
        ...prev,
        [source.id]: data,
      }));

      // If this is the currently selected source, update the UI
      if (source.id === selectedSource.id) {
        if (data.isDirectPlayback && data.directPlaybackInfo) {
          console.log("Updating UI with direct playback data");
          setIsPodcastFeed(true);
          setPodcastUrl(data.directPlaybackInfo.audioUrl);

          // Ensure all required fields are present
          const directPlaybackInfo = {
            title: data.directPlaybackInfo.title,
            audioUrl: data.directPlaybackInfo.audioUrl,
            pubDate:
              data.directPlaybackInfo.pubDate || new Date().toLocaleString(),
            description:
              data.directPlaybackInfo.description || data.notes?.[0] || "",
            imageUrl: data.directPlaybackInfo.imageUrl,
            faviconUrl: data.directPlaybackInfo.faviconUrl,
            feedInfo: data.directPlaybackInfo.feedInfo
              ? {
                  title: data.directPlaybackInfo.feedInfo.title || source.name,
                  imageUrl: data.directPlaybackInfo.feedInfo.imageUrl,
                  link: data.directPlaybackInfo.feedInfo.link || source.url,
                  itunes: data.directPlaybackInfo.feedInfo.itunes,
                }
              : {
                  title: source.name,
                  imageUrl: data.directPlaybackInfo.imageUrl,
                  link: source.url,
                },
          };

          setFeedTitle(directPlaybackInfo.feedInfo.title || source.name);
          setPodcastMetadata({
            ...data,
            isDirectPlayback: true,
            directPlaybackInfo,
          });
        } else {
          console.log("Updating UI with regular playback data");
          setIsPodcastFeed(false);
          setPodcastUrl(`${API_BASE_URL}${data.audioFile}`);
          setPodcastMetadata(data);
        }
      }

      return data;
    } catch (err) {
      console.error(`Failed to process feed ${source.name}:`, err);
      return null;
    }
  };

  // Process all feeds on initial load
  useEffect(() => {
    const processAllFeeds = async () => {
      setIsGenerating(true);
      try {
        // Process feeds in parallel
        await Promise.all(sources.map((source) => processFeed(source)));
      } finally {
        setIsGenerating(false);
      }
    };
    processAllFeeds();
  }, []); // Only run on mount

  useEffect(() => {
    // Initialize audio element
    if (audioRef.current) {
      audioRef.current.addEventListener("loadedmetadata", () => {
        setDuration(Math.floor(audioRef.current?.duration || 0));
      });

      audioRef.current.addEventListener("timeupdate", () => {
        setTimestamp(Math.floor(audioRef.current?.currentTime || 0));
      });

      audioRef.current.addEventListener("ended", () => {
        setIsPlaying(false);
      });
    }
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const rewind = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(
        0,
        audioRef.current.currentTime - 10
      );
    }
  };

  const fastForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(
        duration,
        audioRef.current.currentTime + 10
      );
    }
  };

  const handleSliderChange = (value: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value;
      setTimestamp(value);
    }
  };

  // Add mouse/touch event handlers for push-to-talk
  const handleMouseDown = async () => {
    if (!aiActive && !aiLoading && podcastUrl) {
      // Store current playback state
      const wasPlaying = isPlaying;
      if (wasPlaying) {
        audioRef.current?.pause();
      }
      setAiActive(true);
      setAiLoading(true);
      try {
        await startSession();
        setAiLoading(false);
      } catch (error) {
        console.error("Failed to start AI session:", error);
        setAiActive(false);
        setError(
          error instanceof Error
            ? error.message
            : "Failed to start AI session. Please check your microphone permissions."
        );
        // Resume playback if it was playing
        if (wasPlaying) {
          audioRef.current?.play();
        }
      } finally {
        setAiLoading(false);
      }
    }
  };

  const handleMouseUp = () => {
    if (aiActive) {
      stopSession();
      setAiActive(false);
    }
  };

  // Add event listeners for keyboard support
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.code === "Space" && !aiActive && !aiLoading && podcastUrl) {
        e.preventDefault();
        const wasPlaying = isPlaying;
        if (wasPlaying) {
          audioRef.current?.pause();
        }
        setAiActive(true);
        setAiLoading(true);
        try {
          await startSession();
          setAiLoading(false);
        } catch (error) {
          console.error("Failed to start AI session:", error);
          setAiActive(false);
          setError(
            error instanceof Error
              ? error.message
              : "Failed to start AI session. Please check your microphone permissions."
          );
          if (wasPlaying) {
            audioRef.current?.play();
          }
        } finally {
          setAiLoading(false);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && aiActive) {
        e.preventDefault();
        stopSession();
        setAiActive(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [aiActive, aiLoading, podcastUrl, isPlaying]);

  // Add cleanup effect to ensure AI session is stopped when component unmounts
  useEffect(() => {
    return () => {
      if (aiActive) {
        stopSession();
        setAiActive(false);
      }
    };
  }, [aiActive]);

  // Sync AI session state with our local state
  useEffect(() => {
    if (!isSessionActive && aiActive) {
      setAiActive(false);
    }
  }, [isSessionActive]);

  useEffect(() => {
    // Pass the podcast notes as context to the session
    if (isSessionActive && podcastMetadata?.notes) {
      updateSession({
        instructions: `${realtimePrompt}
# Podcast Notes
${podcastMetadata.notes.join("\n\n")}`,
      });
    }
  }, [isSessionActive, podcastMetadata]);

  const setSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const handleSourceChange = (source: Source) => {
    setSelectedSource(source);
    setError(null);

    // Use the preprocessed data if available
    const feedData = processedFeeds[source.id];
    if (feedData) {
      console.log("Loading feed data:", feedData);
      if (feedData.isDirectPlayback && feedData.directPlaybackInfo) {
        console.log(
          "Setting direct playback data:",
          feedData.directPlaybackInfo
        );
        setIsPodcastFeed(true);
        setPodcastUrl(feedData.directPlaybackInfo.audioUrl);

        // Ensure all required fields are present
        const directPlaybackInfo = {
          title: feedData.directPlaybackInfo.title,
          audioUrl: feedData.directPlaybackInfo.audioUrl,
          pubDate:
            feedData.directPlaybackInfo.pubDate || new Date().toLocaleString(),
          description:
            feedData.directPlaybackInfo.description ||
            feedData.notes?.[0] ||
            "",
          imageUrl: feedData.directPlaybackInfo.imageUrl,
          faviconUrl: feedData.directPlaybackInfo.faviconUrl,
          feedInfo: feedData.directPlaybackInfo.feedInfo
            ? {
                title:
                  feedData.directPlaybackInfo.feedInfo.title || source.name,
                imageUrl: feedData.directPlaybackInfo.feedInfo.imageUrl,
                link: feedData.directPlaybackInfo.feedInfo.link || source.url,
                itunes: feedData.directPlaybackInfo.feedInfo.itunes,
              }
            : {
                title: source.name,
                imageUrl: feedData.directPlaybackInfo.imageUrl,
                link: source.url,
              },
        };

        setFeedTitle(directPlaybackInfo.feedInfo.title || source.name);
        setPodcastMetadata({
          ...feedData,
          isDirectPlayback: true,
          directPlaybackInfo,
        });
        setExpandedDescription(false);
      } else {
        console.log("Setting regular playback data");
        setIsPodcastFeed(false);
        setPodcastUrl(`${API_BASE_URL}${feedData.audioFile}`);
        setPodcastMetadata(feedData);
      }
    } else {
      console.log("No processed data, processing feed...");
      // If feed hasn't been processed yet, process it now
      processFeed(source);
    }
  };

  const handleAddCustomSource = async (url: string) => {
    let feedInfo: FeedInfo | null = null;
    try {
      console.log("Starting custom feed addition:", url);

      // First get feed info
      const response = await fetch(`${API_BASE_URL}/podcast-playback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rssFeedUrl: url,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch feed information");
      }

      feedInfo = await response.json();
      console.log("Feed info received:", feedInfo);

      const feedTitle = feedInfo?.feedInfo?.title || new URL(url).hostname;
      const newSource: Source = {
        id: `custom-${Date.now()}`,
        name: feedTitle,
        url,
        description: url,
        isCustom: true,
        imageUrl: feedInfo?.feedInfo?.imageUrl || feedInfo?.imageUrl,
      };

      // Process the feed
      console.log("Processing feed...");
      const processResponse = await fetch(`${API_BASE_URL}/generate-podcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rssFeedUrl: url,
        }),
      });

      if (!processResponse.ok) {
        throw new Error("Failed to process feed");
      }

      const processedData = await processResponse.json();
      console.log("Feed processed:", processedData);

      // Update all states in a single batch
      const updates = () => {
        console.log("Updating states...");
        setSources((prev) => [...prev, newSource]);
        setSelectedSource(newSource);
        setProcessedFeeds((prev) => ({
          ...prev,
          [newSource.id]: processedData,
        }));

        // Always use the direct playback info from the initial feed info
        if (feedInfo?.audioUrl) {
          console.log("Setting direct playback state");
          setIsPodcastFeed(true);
          setPodcastUrl(feedInfo.audioUrl);
          if (feedInfo.feedInfo?.title) {
            setFeedTitle(feedInfo.feedInfo.title);
          }
          setPodcastMetadata({
            ...processedData,
            isDirectPlayback: true,
            directPlaybackInfo: {
              title: feedInfo.title,
              audioUrl: feedInfo.audioUrl,
              pubDate: feedInfo.pubDate,
              description: feedInfo.description,
              feedInfo: feedInfo.feedInfo,
            },
          });
        } else {
          console.log("Setting regular playback state");
          setIsPodcastFeed(false);
          setPodcastUrl(`${API_BASE_URL}${processedData.audioFile}`);
          setPodcastMetadata(processedData);
        }
        console.log("States updated");
      };

      // Use setTimeout to ensure state updates happen in the next tick
      setTimeout(updates, 0);
    } catch (error) {
      console.error("Failed to add custom source:", error);
      const hostname = new URL(url).hostname;
      const newSource: Source = {
        id: `custom-${Date.now()}`,
        name: hostname,
        url,
        description: url,
        isCustom: true,
      };

      try {
        console.log("Retrying feed processing...");
        const processResponse = await fetch(
          `${API_BASE_URL}/generate-podcast`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              rssFeedUrl: url,
            }),
          }
        );

        if (processResponse.ok) {
          const processedData = await processResponse.json();
          console.log("Feed processed on retry:", processedData);

          // Update all states in a single batch
          const updates = () => {
            console.log("Updating states on retry...");
            setSources((prev) => [...prev, newSource]);
            setSelectedSource(newSource);
            setProcessedFeeds((prev) => ({
              ...prev,
              [newSource.id]: processedData,
            }));

            // Always use the direct playback info from the initial feed info
            if (feedInfo?.audioUrl) {
              console.log("Setting direct playback state on retry");
              setIsPodcastFeed(true);
              setPodcastUrl(feedInfo.audioUrl);
              if (feedInfo.feedInfo?.title) {
                setFeedTitle(feedInfo.feedInfo.title);
              }
              setPodcastMetadata({
                ...processedData,
                isDirectPlayback: true,
                directPlaybackInfo: {
                  title: feedInfo.title,
                  audioUrl: feedInfo.audioUrl,
                  pubDate: feedInfo.pubDate,
                  description: feedInfo.description,
                  feedInfo: feedInfo.feedInfo,
                },
              });
            } else {
              console.log("Setting regular playback state on retry");
              setIsPodcastFeed(false);
              setPodcastUrl(`${API_BASE_URL}${processedData.audioFile}`);
              setPodcastMetadata(processedData);
            }
            console.log("States updated on retry");
          };

          // Use setTimeout to ensure state updates happen in the next tick
          setTimeout(updates, 0);
        }
      } catch (processError) {
        console.error("Failed to process feed:", processError);
        setSources((prev) => [...prev, newSource]);
        setSelectedSource(newSource);
      }
    }
  };

  // Add this function to check if content is truncated
  const isContentTruncated = (element: HTMLDivElement | null) => {
    if (!element) return false;
    return element.scrollHeight > element.clientHeight;
  };

  // Add this effect to check truncation when content changes
  useEffect(() => {
    if (podcastMetadata?.directPlaybackInfo?.description) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        setIsTruncated(isContentTruncated(descriptionRef.current));
      });
    }
  }, [podcastMetadata?.directPlaybackInfo?.description]);

  // Helper for artwork src
  const getArtworkSrc = () => {
    // Use same comprehensive image logic as the modal
    const bestItemImage = podcastMetadata?.directPlaybackInfo?.imageUrl;
    const feedChannelImage =
      podcastMetadata?.directPlaybackInfo?.feedInfo?.imageUrl;
    const firstFeedItemImage = podcastMetadata?.feedItems?.[0]?.imageUrl;
    const firstFeedItemThumbnail =
      podcastMetadata?.feedItems?.[0]?.thumbnailUrl;
    const firstFeedItemEnclosure =
      podcastMetadata?.feedItems?.[0]?.enclosure?.imageUrl;
    const firstFeedItemItunes = podcastMetadata?.feedItems?.[0]?.itunes?.image;
    const sourceSelectorImage = selectedSource?.imageUrl;
    const faviconImage = podcastMetadata?.directPlaybackInfo?.faviconUrl;

    const imgSrc =
      bestItemImage ||
      feedChannelImage ||
      firstFeedItemImage ||
      firstFeedItemThumbnail ||
      firstFeedItemEnclosure ||
      firstFeedItemItunes ||
      sourceSelectorImage ||
      faviconImage;

    if (imgSrc) {
      return `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(imgSrc)}`;
    }
    return "";
  };

  // --- MOBILE PLAYER FOOTER ---
  if (isMobile) {
    return (
      <>
        {/* Main content (list, etc) */}
        <div className="pb-20 min-h-screen bg-gray-50">
          <div className="max-w-4xl mx-auto p-4 space-y-6">
            {/* Header Section */}
            <div className="text-center py-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Podcast Jukebox
              </h1>
              <p className="text-sm text-gray-600">
                Transform any feed or turn your regular podcasts into a
                conversation with your hosts Roshan and Nathaniel
              </p>
            </div>

            {/* Source Selector */}
            <SourceSelector
              sources={sources}
              selectedSource={selectedSource}
              onSourceChange={handleSourceChange}
              onAddCustomSource={handleAddCustomSource}
            />

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {isGenerating && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800">Processing feeds...</p>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Player Footer */}
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 bg-white border-t flex items-center justify-between px-4 py-2 shadow-lg cursor-pointer ${
            isPodcastFeed
              ? "border-blue-200 bg-blue-50"
              : "border-purple-200 bg-purple-50"
          }`}
          onClick={() => setMobilePlayerOpen(true)}
        >
          <div className="flex items-center">
            {/* Content Type Indicator */}
            <div
              className={`w-3 h-3 rounded-full mr-2 flex-shrink-0 ${
                isPodcastFeed ? "bg-blue-500" : "bg-purple-500"
              }`}
            />
            {getArtworkSrc() && (
              <img
                src={getArtworkSrc()}
                alt="artwork"
                className="w-12 h-12 rounded object-cover mr-3"
              />
            )}
            <div className="truncate max-w-[120px]">
              <div className="font-medium text-sm truncate">
                {podcastMetadata?.directPlaybackInfo?.title ||
                  podcastMetadata?.directPlaybackInfo?.feedInfo?.title ||
                  selectedSource?.name ||
                  "Podcast Player"}
              </div>
              <div
                className={`text-xs truncate ${
                  isPodcastFeed ? "text-blue-600" : "text-purple-600"
                }`}
              >
                {isPodcastFeed
                  ? "🎧 Original Podcast"
                  : `🤖 Personalized by ${hostNames.join(" and ")}`}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="ml-2"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6" />
            )}
          </Button>
        </div>

        {/* Slide-up Player Modal */}
        {mobilePlayerOpen && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4">
              <div
                className="w-12 h-1.5 bg-gray-300 rounded-full cursor-pointer mt-3"
                onClick={() => setMobilePlayerOpen(false)}
              />
            </div>

            {/* Podcast Header with Image and Info */}
            <div className="px-4 pb-4">
              <div className="flex flex-col items-center space-y-4">
                {/* Large Image Section */}
                <div className="w-full max-w-sm aspect-square">
                  {(() => {
                    // Use same image logic as desktop
                    const bestItemImage =
                      podcastMetadata?.directPlaybackInfo?.imageUrl;
                    const feedChannelImage =
                      podcastMetadata?.directPlaybackInfo?.feedInfo?.imageUrl;
                    const firstFeedItemImage =
                      podcastMetadata?.feedItems?.[0]?.imageUrl;
                    const firstFeedItemThumbnail =
                      podcastMetadata?.feedItems?.[0]?.thumbnailUrl;
                    const firstFeedItemEnclosure =
                      podcastMetadata?.feedItems?.[0]?.enclosure?.imageUrl;
                    const firstFeedItemItunes =
                      podcastMetadata?.feedItems?.[0]?.itunes?.image;
                    const sourceSelectorImage = selectedSource?.imageUrl;
                    const faviconImage =
                      podcastMetadata?.directPlaybackInfo?.faviconUrl;

                    let imgSrc =
                      bestItemImage ||
                      feedChannelImage ||
                      firstFeedItemImage ||
                      firstFeedItemThumbnail ||
                      firstFeedItemEnclosure ||
                      firstFeedItemItunes ||
                      sourceSelectorImage ||
                      faviconImage;

                    if (imgSrc) {
                      const proxyUrl = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(imgSrc)}`;
                      return (
                        <img
                          src={proxyUrl}
                          alt={
                            podcastMetadata?.directPlaybackInfo?.title ||
                            "Podcast artwork"
                          }
                          className="w-full h-full rounded-2xl object-cover shadow-lg"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = "none";
                          }}
                        />
                      );
                    } else {
                      return (
                        <div className="w-full h-full bg-gray-100 rounded-2xl flex items-center justify-center shadow-lg">
                          <div className="text-gray-400 text-center">
                            <div className="w-24 h-24 mx-auto mb-2 bg-gray-200 rounded-full flex items-center justify-center">
                              <Mic className="w-12 h-12" />
                            </div>
                            <p className="text-sm">No artwork available</p>
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>

                {/* Title and Info Section */}
                <div className="text-center space-y-2">
                  {/* Content Type Badge */}
                  <div
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      isPodcastFeed
                        ? "bg-blue-100 text-blue-800 border border-blue-200"
                        : "bg-purple-100 text-purple-800 border border-purple-200"
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full mr-2 ${
                        isPodcastFeed ? "bg-blue-500" : "bg-purple-500"
                      }`}
                    />
                    {isPodcastFeed
                      ? "🎧 Original Podcast"
                      : `🤖 Personalized by ${hostNames.join(" and ")}`}
                  </div>
                  <h1 className="text-xl font-bold text-gray-900">
                    {podcastMetadata?.directPlaybackInfo?.title ||
                      podcastMetadata?.directPlaybackInfo?.feedInfo?.title ||
                      selectedSource?.name ||
                      "Podcast Player"}
                  </h1>
                  {isPodcastFeed &&
                    podcastMetadata?.directPlaybackInfo?.feedInfo?.title && (
                      <div className="text-base font-normal text-gray-600">
                        {podcastMetadata.directPlaybackInfo.feedInfo.title}
                      </div>
                    )}
                  {isPodcastFeed &&
                    podcastMetadata?.directPlaybackInfo?.pubDate && (
                      <div className="text-sm text-gray-500">
                        Published:{" "}
                        {new Date(
                          podcastMetadata.directPlaybackInfo.pubDate
                        ).toLocaleDateString()}
                      </div>
                    )}
                </div>

                {/* Description Section */}
                {isPodcastFeed &&
                  podcastMetadata?.directPlaybackInfo?.description && (
                    <div className="w-full">
                      <div
                        ref={descriptionRef}
                        className={`text-sm text-gray-600 prose prose-sm max-w-none text-center ${!expandedDescription ? "line-clamp-3" : ""}`}
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(
                            podcastMetadata.directPlaybackInfo.description
                          ),
                        }}
                      />
                      {isTruncated && (
                        <button
                          onClick={() =>
                            setExpandedDescription(!expandedDescription)
                          }
                          className="text-sm text-blue-600 hover:text-blue-800 mt-2 block mx-auto"
                        >
                          {expandedDescription ? "Show less" : "Read more"}
                        </button>
                      )}
                    </div>
                  )}

                {/* Podcast Status Badge */}
                {podcastMetadata && (
                  <div className="w-full">
                    <div
                      className={`p-3 rounded-lg border ${
                        isPodcastFeed
                          ? "bg-blue-50 border-blue-200"
                          : "bg-purple-50 border-purple-200"
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-3">
                        <p
                          className={`text-sm text-center ${
                            isPodcastFeed ? "text-blue-800" : "text-purple-800"
                          }`}
                        >
                          {isPodcastFeed
                            ? "🎧 Playing original podcast audio directly"
                            : `🤖 Personalized podcast by ${hostNames.join(" and ")}`}
                        </p>
                      </div>
                      {isPodcastFeed &&
                        podcastMetadata?.directPlaybackInfo?.feedInfo?.link && (
                          <a
                            href={
                              podcastMetadata.directPlaybackInfo.feedInfo.link
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 mt-1 block text-center"
                          >
                            View original podcast →
                          </a>
                        )}
                      {!isPodcastFeed && selectedSource?.url && (
                        <a
                          href={selectedSource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:text-purple-800 mt-1 block text-center"
                        >
                          View original feed →
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Player Controls Section */}
            <div className="px-4 pb-4">
              <div className="space-y-4">
                {/* Progress Bar */}
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-500">
                    {formatTime(timestamp)}
                  </span>
                  <Slider
                    value={[timestamp]}
                    max={duration}
                    step={1}
                    onValueChange={(value) => handleSliderChange(value[0])}
                    disabled={!podcastUrl}
                  />
                  <span className="text-sm text-gray-500">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Playback Controls */}
                <div className="flex items-center justify-center space-x-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={rewind}
                    disabled={!podcastUrl}
                    className="w-12 h-12"
                  >
                    <RotateCcw className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={togglePlay}
                    disabled={!podcastUrl}
                    className="w-16 h-16"
                  >
                    {isPlaying ? (
                      <Pause className="h-8 w-8" />
                    ) : (
                      <Play className="h-8 w-8" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={fastForward}
                    disabled={!podcastUrl}
                    className="w-12 h-12"
                  >
                    <RotateCw className="h-6 w-6" />
                  </Button>
                </div>

                {/* Playback Speed Controls */}
                <div className="flex items-center justify-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpeed(0.5)}
                    disabled={!podcastUrl || playbackSpeed === 0.5}
                  >
                    0.5x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpeed(1)}
                    disabled={!podcastUrl || playbackSpeed === 1}
                  >
                    1x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpeed(1.5)}
                    disabled={!podcastUrl || playbackSpeed === 1.5}
                  >
                    1.5x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpeed(2)}
                    disabled={!podcastUrl || playbackSpeed === 2}
                  >
                    2x
                  </Button>
                </div>

                {/* AI Button */}
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="icon"
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchEnd={handleMouseUp}
                    disabled={!podcastUrl || aiLoading}
                    className={`relative ${aiActive ? "bg-red-500 hover:bg-red-600" : ""} w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 shadow-lg`}
                  >
                    {aiLoading ? (
                      <div className="animate-spin h-10 w-10 border-4 border-current border-t-transparent rounded-full" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <Mic className="h-10 w-10" />
                        <span className="text-xs mt-1 font-medium">
                          {aiActive ? "Release" : "Hold to talk"}
                        </span>
                      </div>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="px-4 pb-4">
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => setMobilePlayerOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          className="hidden"
          src={podcastUrl || undefined}
        />
      </>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{getPodcastTitle()}</h1>
        <div className="flex space-x-4 hidden">
          <Button variant="outline" onClick={() => setShowDebug(!showDebug)}>
            {showDebug ? "Hide Debug" : "Show Debug"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-4">
                {isPodcastFeed &&
                  podcastMetadata?.directPlaybackInfo &&
                  (() => {
                    // Check all possible image sources
                    const bestItemImage =
                      podcastMetadata.directPlaybackInfo.imageUrl; // This is already server-resolved best image
                    const feedChannelImage =
                      podcastMetadata.directPlaybackInfo.feedInfo?.imageUrl; // Specific feed/channel image

                    // Fallbacks from feedItems array (less prioritised now)
                    const firstFeedItemImage =
                      podcastMetadata.feedItems?.[0]?.imageUrl;
                    const firstFeedItemThumbnail =
                      podcastMetadata.feedItems?.[0]?.thumbnailUrl;
                    const firstFeedItemEnclosure =
                      podcastMetadata.feedItems?.[0]?.enclosure?.imageUrl;
                    const firstFeedItemItunes =
                      podcastMetadata.feedItems?.[0]?.itunes?.image;

                    const sourceSelectorImage = selectedSource?.imageUrl;
                    const faviconImage =
                      podcastMetadata.directPlaybackInfo.faviconUrl;

                    console.log("Image sources for rendering:", {
                      bestItemImage,
                      feedChannelImage,
                      firstFeedItemImage,
                      firstFeedItemThumbnail,
                      firstFeedItemEnclosure,
                      firstFeedItemItunes,
                      sourceSelectorImage,
                      faviconImage,
                    });

                    // Updated Prioritization:
                    // 1. Server-resolved best image (episode or feed if episode had none)
                    // 2. Specific Feed/Channel image from server
                    // 3. Fallbacks from feedItems array (general item image, thumbnail, etc.)
                    // 4. Image from SourceSelector component
                    // 5. Favicon
                    let imgSrc =
                      bestItemImage ||
                      feedChannelImage ||
                      firstFeedItemImage ||
                      firstFeedItemThumbnail ||
                      firstFeedItemEnclosure ||
                      firstFeedItemItunes ||
                      sourceSelectorImage ||
                      faviconImage;

                    if (!imgSrc) return null;

                    // Use the proxy endpoint for all images to handle CORS and 403 errors
                    const proxyUrl = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(imgSrc)}`;

                    return (
                      <img
                        src={proxyUrl}
                        alt={
                          podcastMetadata.directPlaybackInfo.title ||
                          "Podcast artwork"
                        }
                        className="w-48 h-48 md:w-24 md:h-24 rounded-lg object-cover flex-shrink-0 shadow-lg"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          // Try each fallback image source in order through the proxy
                          if (
                            img.src.includes(
                              encodeURIComponent(bestItemImage || "")
                            ) &&
                            feedChannelImage
                          ) {
                            img.src = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(feedChannelImage)}`;
                          } else if (
                            img.src.includes(
                              encodeURIComponent(feedChannelImage || "")
                            ) &&
                            firstFeedItemImage
                          ) {
                            img.src = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(firstFeedItemImage)}`;
                          } else if (
                            img.src.includes(
                              encodeURIComponent(firstFeedItemImage || "")
                            ) &&
                            firstFeedItemThumbnail
                          ) {
                            img.src = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(firstFeedItemThumbnail)}`;
                          } else if (
                            img.src.includes(
                              encodeURIComponent(firstFeedItemThumbnail || "")
                            ) &&
                            firstFeedItemEnclosure
                          ) {
                            img.src = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(firstFeedItemEnclosure)}`;
                          } else if (
                            img.src.includes(
                              encodeURIComponent(firstFeedItemEnclosure || "")
                            ) &&
                            firstFeedItemItunes
                          ) {
                            img.src = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(firstFeedItemItunes)}`;
                          } else if (
                            img.src.includes(
                              encodeURIComponent(firstFeedItemItunes || "")
                            ) &&
                            sourceSelectorImage
                          ) {
                            img.src = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(sourceSelectorImage)}`;
                          } else if (
                            img.src.includes(
                              encodeURIComponent(sourceSelectorImage || "")
                            ) &&
                            faviconImage
                          ) {
                            img.src = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(faviconImage)}`;
                          } else {
                            img.style.display = "none";
                          }
                        }}
                      />
                    );
                  })()}
                <div className="flex-1 min-w-0 text-center md:text-left">
                  <CardTitle className="text-lg">
                    {podcastMetadata?.directPlaybackInfo?.title ||
                      podcastMetadata?.directPlaybackInfo?.feedInfo?.title ||
                      selectedSource?.name ||
                      "Podcast Player"}
                  </CardTitle>
                  {isPodcastFeed &&
                    podcastMetadata?.directPlaybackInfo?.feedInfo?.title && (
                      <div className="text-sm font-normal text-gray-600 mt-1 truncate">
                        {podcastMetadata.directPlaybackInfo.feedInfo.title}
                      </div>
                    )}
                  {isPodcastFeed &&
                    podcastMetadata?.directPlaybackInfo?.pubDate && (
                      <div className="text-xs text-gray-500 mt-1">
                        Published:{" "}
                        {new Date(
                          podcastMetadata.directPlaybackInfo.pubDate
                        ).toLocaleDateString()}
                      </div>
                    )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isPodcastFeed && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-blue-800">
                          🎧 Playing original podcast audio directly
                        </p>
                        {podcastMetadata?.directPlaybackInfo?.feedInfo
                          ?.link && (
                          <a
                            href={
                              podcastMetadata.directPlaybackInfo.feedInfo.link
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 mt-1 inline-block"
                          >
                            View original podcast →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {isPodcastFeed &&
                  podcastMetadata?.directPlaybackInfo?.description && (
                    <div className="mt-2">
                      <div
                        ref={descriptionRef}
                        className={`text-sm text-gray-600 prose prose-sm max-w-none ${!expandedDescription ? "line-clamp-2" : ""}`}
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(
                            podcastMetadata.directPlaybackInfo.description
                          ),
                        }}
                      />
                      {isTruncated && (
                        <button
                          onClick={() =>
                            setExpandedDescription(!expandedDescription)
                          }
                          className="text-sm text-blue-600 hover:text-blue-800 mt-1"
                        >
                          {expandedDescription ? "Show less" : "Read more"}
                        </button>
                      )}
                    </div>
                  )}
                <audio
                  ref={audioRef}
                  className="hidden"
                  src={podcastUrl || undefined}
                />

                {/* Central Microphone Button */}
                <div className="flex justify-center mb-6">
                  <Button
                    variant="outline"
                    size="icon"
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchEnd={handleMouseUp}
                    disabled={!podcastUrl || aiLoading}
                    className={`relative ${aiActive ? "bg-red-500 hover:bg-red-600" : ""} w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg`}
                  >
                    {aiLoading ? (
                      <div className="animate-spin h-12 w-12 border-4 border-current border-t-transparent rounded-full" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <Mic className="h-12 w-12" />
                        <span className="text-sm mt-2 font-medium">
                          {aiActive ? "Release to stop" : "Hold to talk"}
                        </span>
                      </div>
                    )}
                  </Button>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-500">
                    {formatTime(timestamp)}
                  </span>
                  <Slider
                    value={[timestamp]}
                    max={duration}
                    step={1}
                    onValueChange={(value) => handleSliderChange(value[0])}
                    disabled={!podcastUrl}
                  />
                  <span className="text-sm text-gray-500">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Playback Controls */}
                <div className="flex items-center justify-center space-x-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={rewind}
                    disabled={!podcastUrl}
                    className="w-12 h-12"
                  >
                    <RotateCcw className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={togglePlay}
                    disabled={!podcastUrl}
                    className="w-16 h-16"
                  >
                    {isPlaying ? (
                      <Pause className="h-8 w-8" />
                    ) : (
                      <Play className="h-8 w-8" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={fastForward}
                    disabled={!podcastUrl}
                    className="w-12 h-12"
                  >
                    <RotateCw className="h-6 w-6" />
                  </Button>
                </div>

                {/* Playback Speed Controls */}
                <div className="flex items-center justify-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpeed(0.5)}
                    disabled={!podcastUrl || playbackSpeed === 0.5}
                  >
                    0.5x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpeed(1)}
                    disabled={!podcastUrl || playbackSpeed === 1}
                  >
                    1x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpeed(1.5)}
                    disabled={!podcastUrl || playbackSpeed === 1.5}
                  >
                    1.5x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpeed(2)}
                    disabled={!podcastUrl || playbackSpeed === 2}
                  >
                    2x
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <SourceSelector
            sources={sources}
            selectedSource={selectedSource}
            onSourceChange={handleSourceChange}
            onAddCustomSource={handleAddCustomSource}
          />

          <div className="flex justify-center mt-8">
            {isGenerating && (
              <div className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing feeds...
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 mt-8 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}
        </div>
      </div>

      {showDebug && <DebugPage />}
    </div>
  );
}

// Helper function to format time in MM:SS
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
