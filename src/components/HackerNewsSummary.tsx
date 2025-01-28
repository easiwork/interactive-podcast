import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { summarizeArticle } from "@/ai-utils";
import { extract } from "@extractus/article-extractor";

interface Article {
  title: string;
  url: string;
  summary: string;
  audioUrl?: string;
}

const TEXT_TO_SPEECH_URL = "http://localhost:3000/api/text-to-speech";

export function HackerNewsSummary() {
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTopStory();
  }, []);

  const fetchTopStory = async () => {
    try {
      // Get top stories from HN
      const topStoriesResponse = await fetch(
        "https://hacker-news.firebaseio.com/v0/topstories.json"
      );
      const topStories = await topStoriesResponse.json();

      // Get details of first story
      const firstStoryResponse = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${topStories[0]}.json`
      );
      const story = await firstStoryResponse.json();
      console.log("story", story.url);

      const contentResponse = await fetch(
        `/__vite_dev_proxy__?url=${encodeURIComponent(story.url)}`
      );
      const rawHtml = await contentResponse.text();
      const articleData = await extract(rawHtml);
      let summary = "";

      if (articleData) {
        // Get article summary from OpenAI
        summary = await summarizeArticle(articleData);
      }
      const audioBuffer = await fetch(TEXT_TO_SPEECH_URL, {
        method: "POST",
        body: JSON.stringify({ text: summary }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      const audioBlob = await audioBuffer.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      setArticle({
        title: story.title,
        url: story.url,
        audioUrl,
        //TODO - fix
        summary: "",
      });
    } catch (err) {
      setError("Failed to fetch article");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Alert>
        <AlertDescription>Loading article...</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          <a
            href={article?.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {article?.title}
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* {article && (
          <p
            className="text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: article.summary }}
          ></p>
        )} */}
        <p className="text-sm text-muted-foreground">{article?.summary}</p>
      </CardContent>
      <CardFooter>
        {article?.audioUrl && (
          <audio src={article.audioUrl} className="w-full mb-4" controls />
        )}
      </CardFooter>
    </Card>
  );
}
