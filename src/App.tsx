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
  const audioRef = useRef<HTMLAudioElement>(null);
  const { startSession, stopSession, isSessionActive, updateSession } =
    useRealtimeSession();

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const getPodcastTitle = () => {
    if (isLoading) return "Loading...";
    if (!podcastMetadata) return "No podcast available";
    return isToday(selectedDate)
      ? "Today's Hacker News Podcast"
      : `Hacker News Podcast - ${selectedDate.toLocaleDateString()}`;
  };

  const loadPodcastForDate = async (date: Date) => {
    setIsLoading(true);
    try {
      const dateStr = date.toISOString().split("T")[0];
      const response = await fetch(
        `${API_BASE_URL}/podcasts/${dateStr}/metadata.json`
      );
      if (response.ok) {
        const metadata = await response.json();
        setPodcastMetadata(metadata);
        if (audioRef.current) {
          audioRef.current.src = `${API_BASE_URL}${metadata.audioFile}`;
        }
      } else {
        setPodcastMetadata(null);
      }
    } catch (error) {
      console.error("Failed to load podcast:", error);
      setPodcastMetadata(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPodcastForDate(selectedDate);
  }, [selectedDate]);

  const navigateDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
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
        if (aiActive) {
          setAiActive(false);
          stopSession();
        }
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

  const toggleAI = async () => {
    const newAiActive = !aiActive;
    setAiActive(newAiActive);

    if (newAiActive) {
      setIsPlaying(false);
      audioRef.current?.pause();
      setAiLoading(true);
      try {
        await startSession();
      } catch (error) {
        console.error("Failed to start AI session:", error);
        setAiActive(false);
      } finally {
        setAiLoading(false);
      }
    } else {
      stopSession();
      setIsPlaying(true);
      audioRef.current?.play();
    }
  };

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

  return (
    <div className="max-w-xl mx-auto mt-10 p-4 space-y-6">
      <audio ref={audioRef} />
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-xl font-bold">{getPodcastTitle()}</h2>

          <div className="flex items-center justify-between space-x-4">
            <Button variant="ghost" onClick={() => navigateDate(-1)}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <div className="text-sm font-medium">
              {selectedDate.toLocaleDateString()}
            </div>
            <Button variant="ghost" onClick={() => navigateDate(1)}>
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {podcastMetadata && (
            <>
              <div className="flex items-center justify-between space-x-4">
                <Button variant="ghost" onClick={rewind}>
                  <RotateCcw />
                </Button>
                <Button variant="ghost" onClick={togglePlay}>
                  {isPlaying ? <Pause /> : <Play />}
                </Button>
                <Button variant="ghost" onClick={fastForward}>
                  <RotateCw />
                </Button>
              </div>
              <Slider
                value={[timestamp]}
                max={duration}
                step={1}
                onValueChange={(val) => handleSliderChange(val[0])}
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>{formatTime(timestamp)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="flex justify-center space-x-2">
                <Button
                  variant={playbackSpeed === 1 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSpeed(1)}
                >
                  1x
                </Button>
                <Button
                  variant={playbackSpeed === 1.5 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSpeed(1.5)}
                >
                  1.5x
                </Button>
                <Button
                  variant={playbackSpeed === 2 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSpeed(2)}
                >
                  2x
                </Button>
              </div>
              <div className="flex justify-center pt-2">
                <Button
                  onClick={toggleAI}
                  disabled={aiLoading}
                  className={aiLoading ? "opacity-50" : ""}
                >
                  {aiLoading ? (
                    <>Starting AI...</>
                  ) : aiActive ? (
                    <>
                      <X className="mr-2" />
                      Stop AI
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2" />
                      Ask AI About Podcast
                    </>
                  )}
                </Button>
              </div>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center space-x-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
                  <Link className="w-4 h-4" />
                  <span>Source Articles</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="space-y-2">
                    {podcastMetadata.stories.map((story, index) => (
                      <a
                        key={index}
                        href={story.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {story.title}
                      </a>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </CardContent>
      </Card>

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
