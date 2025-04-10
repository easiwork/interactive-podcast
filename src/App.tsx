import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HackerNewsSummary } from "@/components/HackerNewsSummary";
import { fetchHNStory, Story } from "./components/hacker-news-api";
import { fetchHNTopStories } from "./components/hacker-news-api";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Pause, Play, RotateCcw, RotateCw, Mic, X } from "lucide-react";

const NUM_STORIES = 10;
interface StoryMetadata extends Story {
  expanded: boolean;
}

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [timestamp, setTimestamp] = useState(0);
  const [aiActive, setAiActive] = useState(false);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

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
          setAiActive(false); // Deactivate AI when playing audio
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

  const toggleAI = () => {
    setAiActive(!aiActive);
    if (!aiActive) {
      setIsPlaying(false);
      audioRef.current?.pause();
    } else {
      setIsPlaying(true);
      audioRef.current?.play();
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-4 space-y-6">
      <audio ref={audioRef} src="test.mp3" />
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-xl font-bold">Podcast Title</h2>
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
          <div className="flex justify-center pt-2">
            <Button onClick={toggleAI}>
              {aiActive ? <X className="mr-2" /> : <Mic className="mr-2" />}
              {aiActive ? "Stop AI" : "Ask AI About Podcast"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper function to format time in MM:SS
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
