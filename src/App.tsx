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

  const togglePlay = () => setIsPlaying(!isPlaying);
  const rewind = () => setTimestamp((t) => Math.max(0, t - 10));
  const fastForward = () => setTimestamp((t) => t + 10);

  const handleSliderChange = (value: number) => setTimestamp(value);
  const toggleAI = () => {
    setAiActive(!aiActive);
    if (!aiActive) {
      setIsPlaying(false); // pause podcast when activating AI
    } else {
      setIsPlaying(true); // resume podcast when deactivating AI
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-4 space-y-6">
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
            max={3600}
            step={1}
            onValueChange={(val) => handleSliderChange(val[0])}
          />
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
