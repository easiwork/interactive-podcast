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
import { Input } from "@/components/ui/input";

const NUM_STORIES = 10;
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
  const {
    startSession,
    stopSession,
    isSessionActive,
    updateSession,
    checkMicrophonePermission,
  } = useRealtimeSession();
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
  const [searchInput, setSearchInput] = useState("");
  const [searchType, setSearchType] = useState<"url" | "podcast" | "website">(
    "url"
  );
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [modalHeight, setModalHeight] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(false);
  const [isCheckingMicrophone, setIsCheckingMicrophone] = useState(false);

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

      // Add error handling
      audioRef.current.addEventListener("error", (e) => {
        console.error("Audio playback error:", e);
        // Fall back to failure audio
        if (audioRef.current) {
          audioRef.current.src = `${API_BASE_URL}/public/podcast_failure.m4a`;
          audioRef.current.load();
          setError(
            "Failed to load podcast audio. Playing error message instead."
          );
        }
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

  // Add event listeners for keyboard support
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.code === "Space" && !aiActive && !aiLoading && podcastUrl) {
        e.preventDefault();
        
        // First handle microphone permission if needed
        if (!hasMicrophonePermission) {
          setIsCheckingMicrophone(true);
          try {
            const hasPermission = await checkMicrophonePermission();
            setHasMicrophonePermission(hasPermission);
            if (!hasPermission) {
              setError("Microphone permission is required to use this feature");
            }
          } catch (error) {
            console.error("Failed to check microphone permission:", error);
            setError("Failed to access microphone");
          } finally {
            setIsCheckingMicrophone(false);
          }
          return; // Exit after handling permissions, don't start session
        }

        // Only proceed with session start if we have permission
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
  }, [aiActive, aiLoading, podcastUrl, isPlaying, hasMicrophonePermission]);

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
        // Check if the audio file exists before setting it
        const audioPath = `${API_BASE_URL}${feedData.audioFile}`;
        fetch(audioPath, { method: "HEAD" })
          .then((response) => {
            if (!response.ok) {
              throw new Error("Audio file not found");
            }
            setPodcastUrl(audioPath);
          })
          .catch((error) => {
            console.error("Error checking audio file:", error);
            setPodcastUrl(`${API_BASE_URL}/public/podcast_failure.m4a`);
            setError(
              "Failed to load podcast audio. Playing error message instead."
            );
          });
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
      faviconImage ||
      "/hosts.png"; // Use hosts.png as the final fallback

    if (imgSrc.startsWith("http")) {
      return `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(imgSrc)}`;
    }
    return imgSrc; // Return the hosts.png path directly if it's the fallback
  };

  // Search handler
  const handleSearchSubmit = async () => {
    if (searchInput.trim()) {
      try {
        if (searchType === "url") {
          await handleAddCustomSource(searchInput.trim());
        }
        // TODO: Add podcast directory search and website search
      } catch (error) {
        console.error("Search failed:", error);
      }

      setSearchInput("");
    }
  };

  // Add touch handlers for the drawer
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY;

    // Only allow dragging down if we're at the top of the content
    if (diff > 0 && modalRef.current?.scrollTop === 0) {
      e.preventDefault();
      const newHeight = Math.max(0, modalHeight - diff);
      setModalHeight(newHeight);

      // Close the modal if dragged down more than 100px
      if (diff > 100) {
        setIsDragging(false);
        setMobilePlayerOpen(false);
        setModalHeight(0);
      }
    }
  };

  const handleTouchEnd = () => {
    setTouchStartY(null);
    setIsDragging(false);
    // Reset height if not closed
    if (modalHeight > 0) {
      setModalHeight(0);
    }
  };

  // Add effect to handle opening/closing animation
  useEffect(() => {
    if (mobilePlayerOpen) {
      setIsVisible(true);
      // Start opening animation on next frame
      requestAnimationFrame(() => {
        setIsOpening(true);
      });
      // Reset opening state after animation
      const timer = setTimeout(() => {
        setIsOpening(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      // Start closing animation
      setIsOpening(true);
      // Wait for close animation to finish before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsOpening(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [mobilePlayerOpen]);

  // Update the close handler to use animation
  const handleClose = () => {
    setMobilePlayerOpen(false);
  };

  // Handle precise dragging of the modal
  const handleHandleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    setTouchStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleHandleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchStartY === null) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY;
    const newHeight = Math.max(0, diff);

    // Update modal position based on drag
    setModalHeight(newHeight);

    // Close if dragged down more than 100px
    if (diff > 100) {
      setIsDragging(false);
      handleClose();
      setModalHeight(0);
    }
  };

  const handleHandleTouchEnd = () => {
    if (modalHeight > 50) {
      // If dragged more than 50px, close the modal
      handleClose();
    }
    setModalHeight(0);
    setTouchStartY(null);
    setIsDragging(false);
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
              <img
                src="/hosts.png"
                alt="Hosts"
                className="w-32 h-32 mx-auto mb-4 rounded-full object-cover"
              />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Podcast Jukebox
              </h1>
              <p className="text-sm text-gray-600">
                Transform any feed or turn your regular podcasts into a
                conversation with your hosts Roshan and Nathaniel
              </p>
            </div>

            {/* Search Section */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-lg font-semibold mb-4"> Add Content</h3>

              {/* Search Type Selection */}
              <div className="flex space-x-2 mb-4">
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

              {/* Search Input */}
              <div className="flex items-center space-x-2 mb-2">
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearchSubmit();
                    }
                  }}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleSearchSubmit}
                disabled={!searchInput.trim()}
              >
                {searchType === "url" ? "Add Feed" : "Search"}
              </Button>
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
        {isVisible && (
          <div
            ref={modalRef}
            className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto transition-all duration-300 ease-out ${
              isDragging ? "transition-none" : ""
            } ${!isOpening ? "translate-y-0" : "translate-y-full"}`}
            style={{
              touchAction: "pan-y",
              transform: `translateY(${isDragging ? modalHeight : 0}px)`,
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex justify-center mb-4 sticky top-0 bg-white z-10">
              <div
                className="w-12 h-1.5 bg-gray-300 rounded-full cursor-pointer mt-3 touch-none active:bg-gray-400 transition-colors"
                onTouchStart={handleHandleTouchStart}
                onTouchMove={handleHandleTouchMove}
                onTouchEnd={handleHandleTouchEnd}
              />
            </div>

            {/* Podcast Header with Image and Info */}
            <div className="px-4 pb-4">
              <div className="flex flex-col items-center space-y-4">
                {/* Large Image Section */}
                <div className="w-full max-w-sm aspect-square">
                  {(() => {
                    const imgSrc = getArtworkSrc();
                    return (
                      <img
                        src={imgSrc}
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
                          className={`