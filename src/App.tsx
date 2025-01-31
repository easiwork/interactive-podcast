import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HackerNewsSummary } from "@/components/HackerNewsSummary";
import { fetchHNStory, Story } from "./components/hacker-news-api";
import { fetchHNTopStories } from "./components/hacker-news-api";
import { Button } from "./components/ui/button";

const NUM_STORIES = 10;

interface StoryMetadata extends Story {
  expanded: boolean;
}

const AudioTranscriptPlayer = () => {
  const [storyIds, setStoryIds] = useState<number[]>([]);
  const [stories, setStories] = useState<StoryMetadata[]>([]);

  useEffect(() => {
    fetchHNTopStories().then(setStoryIds);
  }, []);

  useEffect(() => {
    if (!storyIds.length) {
      return;
    }

    for (let i = 0; i < NUM_STORIES; i++) {
      fetchHNStory(storyIds[i])
        .then((s) => setStories((prev) => [...prev, { ...s, expanded: false }]))
        .catch((e) => {
          console.error("Failed to fetch HN story", e);
        });
    }
  }, [storyIds]);

  console.log("storyIds", storyIds);

  return stories.map((story, index) => (
    <Card className="w-[90vw] mx-auto mt-8" key={index}>
      <CardHeader>
        <CardTitle>
          <div className="flex justify-between">
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {story.title}
            </a>
            <Button
              variant="outline"
              onClick={() =>
                setStories((prev) => {
                  const index = prev.findIndex((s) => s.id === story.id);
                  if (index === -1) {
                    return prev;
                  }

                  return [
                    ...prev.slice(0, index),
                    { ...prev[index], expanded: !story.expanded },
                    ...prev.slice(index + 1),
                  ];
                })
              }
            >
              {story.expanded ? "Hide" : "Show"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      {story.expanded && (
        <CardContent className="p-6">
          <div className="mt-6">
            <HackerNewsSummary story={story} />
          </div>
        </CardContent>
      )}
    </Card>
  ));
};

export default AudioTranscriptPlayer;
