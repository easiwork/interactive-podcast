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
  RefreshCw,
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
  failed?: boolean;
  failureReason?: string;
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
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isButtonHeld, setIsButtonHeld] = useState(false);
  const isButtonHeldRef = useRef(false);

  // Check if debug mode is enabled via query parameter
  const isDebugMode = () => {
    if (typeof window === "undefined") return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("debug") === "true";
  };

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

          // Handle failed podcasts
          if (data.failed) {
            console.log("Podcast generation failed:", data.failureReason);
            setPodcastUrl(data.audioFile); // This should be "/podcast_fail.m4a"
            setError(
              `Podcast generation failed: ${data.failureReason || "Unknown error"}`
            );
          } else {
            setPodcastUrl(`${API_BASE_URL}${data.audioFile}`);
          }

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
  // Manual reload function instead of automatic processing
  const handleReload = async (forceRegenerate: boolean = false) => {
    setIsGenerating(true);
    try {
      // Call the reload endpoint
      const reloadResponse = await fetch(
        `${API_BASE_URL}/reload?force=${forceRegenerate}`,
        {
          method: "GET",
        }
      );

      if (!reloadResponse.ok) {
        throw new Error("Failed to trigger reload");
      }

      const reloadData = await reloadResponse.json();
      console.log("Reload triggered:", reloadData);

      // Then process feeds in parallel
      await Promise.all(sources.map((source) => processFeed(source)));
    } catch (error) {
      console.error("Failed to reload feeds:", error);
      setError("Failed to reload feeds. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

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

  const requestMicrophonePermission = async () => {
    if (hasMicPermission) return;

    setIsRequestingPermission(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      // Stop the stream immediately after getting permission
      stream.getTracks().forEach((track) => track.stop());
      setHasMicPermission(true);
    } catch (error) {
      console.error("Failed to get microphone permission:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to get microphone permission. Please check your browser settings."
      );
    } finally {
      setIsRequestingPermission(false);
    }
  };

  // Add mouse/touch event handlers for push-to-talk
  const handleMouseDown = async () => {
    console.log(
      "Mouse down - hasMicPermission:",
      hasMicPermission,
      "isButtonHeld:",
      isButtonHeld,
      "aiLoading:",
      aiLoading
    );

    // First check if we need to request permission
    if (!hasMicPermission) {
      await requestMicrophonePermission();
      return;
    }

    // Only proceed if button isn't already held and we have a podcast
    if (isButtonHeld || aiLoading || !podcastUrl) {
      return;
    }

    setIsButtonHeld(true);
    isButtonHeldRef.current = true;
    console.log("Button held set to true");

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
      console.log(
        "Session started, checking if button still held:",
        isButtonHeldRef.current
      );

      // Check if button was released while we were starting the session
      if (!isButtonHeldRef.current) {
        console.log(
          "Button was released during session start, stopping session"
        );
        stopSession();
        setAiActive(false);
      }
    } catch (error) {
      console.error("Failed to start AI session:", error);
      setAiActive(false);
      setIsButtonHeld(false);
      isButtonHeldRef.current = false;
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
  };

  const handleMouseUp = () => {
    console.log(
      "Mouse up - was button held:",
      isButtonHeld,
      "aiActive:",
      aiActive
    );
    setIsButtonHeld(false);
    isButtonHeldRef.current = false;
    if (aiActive) {
      console.log("Stopping session on mouse up");
      stopSession();
      setAiActive(false);
    }
  };

  // Add event listeners for keyboard support
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        hasMicPermission &&
        !isButtonHeld &&
        !aiLoading &&
        podcastUrl
      ) {
        e.preventDefault();
        console.log("Space key down - starting session");

        setIsButtonHeld(true);
        isButtonHeldRef.current = true;
        const wasPlaying = isPlaying;
        if (wasPlaying) {
          audioRef.current?.pause();
        }
        setAiActive(true);
        setAiLoading(true);

        try {
          await startSession();
          setAiLoading(false);
          console.log(
            "Session started via keyboard, checking if key still held:",
            isButtonHeldRef.current
          );

          // Check if key was released while we were starting the session
          if (!isButtonHeldRef.current) {
            console.log(
              "Key was released during session start, stopping session"
            );
            stopSession();
            setAiActive(false);
          }
        } catch (error) {
          console.error("Failed to start AI session:", error);
          setAiActive(false);
          setIsButtonHeld(false);
          isButtonHeldRef.current = false;
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
      if (e.code === "Space") {
        e.preventDefault();
        console.log(
          "Space key up - was button held:",
          isButtonHeld,
          "aiActive:",
          aiActive
        );
        setIsButtonHeld(false);
        isButtonHeldRef.current = false;
        if (aiActive) {
          console.log("Stopping session on key up");
          stopSession();
          setAiActive(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    isButtonHeld,
    aiLoading,
    podcastUrl,
    isPlaying,
    hasMicPermission,
    aiActive,
  ]);

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
    // Reset audio player state first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }
    setIsPlaying(false);
    setTimestamp(0);
    setDuration(0);

    // Reset UI state
    setSelectedSource(source);
    setError(null);
    setExpandedDescription(false);

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

        // Handle failed podcasts from cache
        if (feedData.failed) {
          console.log("Cached podcast failed:", feedData.failureReason);
          setPodcastUrl(feedData.audioFile); // This should be "/podcast_fail.m4a"
          setError(
            `Podcast generation failed: ${feedData.failureReason || "Unknown error"}`
          );
        } else {
          setPodcastUrl(`${API_BASE_URL}${feedData.audioFile}`);
        }

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

  // Handle podcast URL changes
  useEffect(() => {
    if (audioRef.current && podcastUrl) {
      // Store current playback rate
      const currentRate = audioRef.current.playbackRate;

      // Reset audio player state
      audioRef.current.pause();
      audioRef.current.currentTime = 0;

      // Set new source and load
      audioRef.current.src = podcastUrl;
      audioRef.current.load();

      // Restore playback rate
      audioRef.current.playbackRate = currentRate;

      // Reset UI state
      setIsPlaying(false);
      setTimestamp(0);
      setDuration(0);

      // Add event listeners for metadata and timeupdate
      const handleMetadataLoaded = () => {
        setDuration(audioRef.current?.duration || 0);
      };

      const handleTimeUpdate = () => {
        setTimestamp(audioRef.current?.currentTime || 0);
      };

      audioRef.current.addEventListener("loadedmetadata", handleMetadataLoaded);
      audioRef.current.addEventListener("timeupdate", handleTimeUpdate);

      return () => {
        if (audioRef.current) {
          audioRef.current.removeEventListener(
            "loadedmetadata",
            handleMetadataLoaded
          );
          audioRef.current.removeEventListener("timeupdate", handleTimeUpdate);
        }
      };
    }
  }, [podcastUrl]);

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

            {/* Reload Controls - only show in debug mode */}
            {isDebugMode() && (
              <div className="flex flex-col space-y-2">
                <div className="flex space-x-2">
                  <Button
                    onClick={() => handleReload(false)}
                    disabled={isGenerating}
                    className="flex-1"
                    variant="outline"
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-2 ${isGenerating ? "animate-spin" : ""}`}
                    />
                    {isGenerating ? "Processing..." : "Reload Feeds"}
                  </Button>
                  <Button
                    onClick={() => handleReload(true)}
                    disabled={isGenerating}
                    variant="outline"
                    className="flex-shrink-0"
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-1 ${isGenerating ? "animate-spin" : ""}`}
                    />
                    Force
                  </Button>
                </div>

                {isGenerating && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-blue-800 text-sm">Processing feeds...</p>
                  </div>
                )}
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
                        podcastMetadata.failed
                          ? "bg-red-50 border-red-200"
                          : isPodcastFeed
                            ? "bg-blue-50 border-blue-200"
                            : "bg-purple-50 border-purple-200"
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-3">
                        <p
                          className={`text-sm text-center ${
                            podcastMetadata.failed
                              ? "text-red-800"
                              : isPodcastFeed
                                ? "text-blue-800"
                                : "text-purple-800"
                          }`}
                        >
                          {podcastMetadata.failed
                            ? "❌ Podcast generation failed"
                            : isPodcastFeed
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
                    disabled={
                      !podcastUrl || aiLoading || isRequestingPermission
                    }
                    className={`relative ${aiActive ? "bg-red-500 hover:bg-red-600" : ""} w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 shadow-lg`}
                  >
                    {aiLoading ? (
                      <div className="animate-spin h-10 w-10 border-4 border-current border-t-transparent rounded-full" />
                    ) : isRequestingPermission ? (
                      <div className="animate-spin h-10 w-10 border-4 border-current border-t-transparent rounded-full" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <Mic className="h-10 w-10" />
                        <span className="text-xs mt-1 font-medium">
                          {aiActive
                            ? "Release"
                            : hasMicPermission
                              ? "Hold to talk"
                              : "Tap for mic"}
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
                onClick={handleClose}
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
      <div className="flex flex-col items-center mb-8">
        <img
          src="/hosts.png"
          alt="Hosts"
          className="w-40 h-40 mb-4 rounded-full object-cover"
        />
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
                {podcastMetadata?.directPlaybackInfo && (
                  <img
                    src={getArtworkSrc()}
                    alt={
                      podcastMetadata.directPlaybackInfo.title ||
                      "Podcast artwork"
                    }
                    className="w-48 h-48 md:w-24 md:h-24 rounded-lg object-cover flex-shrink-0 shadow-lg"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = "none";
                    }}
                  />
                )}
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
                {(isPodcastFeed || podcastMetadata?.failed) && (
                  <div
                    className={`p-3 border rounded-lg ${
                      podcastMetadata?.failed
                        ? "bg-red-50 border-red-200"
                        : "bg-blue-50 border-blue-200"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${
                            podcastMetadata?.failed
                              ? "text-red-800"
                              : "text-blue-800"
                          }`}
                        >
                          {podcastMetadata?.failed
                            ? "❌ Podcast generation failed"
                            : "🎧 Playing original podcast audio directly"}
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
                    disabled={
                      !podcastUrl || aiLoading || isRequestingPermission
                    }
                    className={`relative ${aiActive ? "bg-red-500 hover:bg-red-600" : ""} w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg`}
                  >
                    {aiLoading ? (
                      <div className="animate-spin h-12 w-12 border-4 border-current border-t-transparent rounded-full" />
                    ) : isRequestingPermission ? (
                      <div className="animate-spin h-12 w-12 border-4 border-current border-t-transparent rounded-full" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <Mic className="h-12 w-12" />
                        <span className="text-sm mt-2 font-medium">
                          {aiActive
                            ? "Release to stop"
                            : hasMicPermission
                              ? "Hold to talk"
                              : "Tap for mic"}
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

          {/* Reload Controls for Desktop - only show in debug mode */}
          {isDebugMode() && (
            <div className="flex flex-col space-y-4 mt-6">
              <div className="flex space-x-4 justify-center">
                <Button
                  onClick={() => handleReload(false)}
                  disabled={isGenerating}
                  variant="outline"
                  className="min-w-[140px]"
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${isGenerating ? "animate-spin" : ""}`}
                  />
                  {isGenerating ? "Processing..." : "Reload Feeds"}
                </Button>
                <Button
                  onClick={() => handleReload(true)}
                  disabled={isGenerating}
                  variant="outline"
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${isGenerating ? "animate-spin" : ""}`}
                  />
                  Force Reload
                </Button>
              </div>

              {isGenerating && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <p className="text-blue-800 text-sm">Processing feeds...</p>
                </div>
              )}
            </div>
          )}

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
