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
        // summary = await summarizeArticle(articleData);
        summary = `summary [Opening Jingle]

**Host 1:** Welcome back to TechFrontiers, where we dive deep into the latest in technology and coding innovations. I'm your host, Charlie.

**Host 2:** And I'm Alex. Today, we've got something exciting for all you web development enthusiasts out there, particularly those intrigued by the advancements in WebAssembly, or WASM for short.

**Host 1:** That's right, Alex. We're talking about a breakthrough that's set to double the speed for WASM by capitalizing on SIMD instructions. All thanks to a PR (Pull Request) by Xuan-Son Nguyen for a project called llama.cpp.

**Host 2:** SIMD, for those wondering, stands for Single Instruction, Multiple Data. It's a method that allows one operation to process multiple data points simultaneously. It's quite the game-changer in performance optimization.

**Host 1:** And apparently, 99% of this groundbreaking code was penned by an individual known as DeekSeek-R1. What's fascinating here is that Xuan-Son Nguyen's primary contribution was in developing tests and writing prompts, with some trials and errors along the way.

**Host 2:** They've even shared their prompts, which they ran directly through an R1 on chat.deepseek.com. It's insightful to see how AI and machine learning tools are being utilized to think through coding dilemmas, spending about 3-5 minutes per prompt. 

**Host 1:** Simon Willison, a well-known figure in the coding community, has been spotting very promising results from DeepSeek R1 for code. He shared a transcript where he used it to rewrite the llm_groq.py plugin to adopt a cached model JSON pattern similar to another project he worked on. The PR presented showed significant improvement.

**Host 2:** And when comparing it to another attempt against a different baseline, DeepSeek R1's approach was superior, especially in its ability to rethink the model_map’s necessity—eventually eliminating it for a more dynamic solution.

**Host 1:** This evolution in coding, especially using tools like R1 for optimizing processes and even rethinking solutions, highlights the continuous progress in software development.

**Host 2:** It surely does, Charlie. And the impact of such optimizations on WebAssembly could mean a lot for future web applications, making them faster and more efficient.

**Host 1:** It's incredible to see how contributions across the globe are pushing the boundaries of what's possible, transforming ideas into tangible, impactful technologies.

**Host 2:** Absolutely, and we'll be keeping an eye on the developments in this space. That's all for today's episode. We'd love to hear your thoughts on SIMD optimizations for WASM or any experiences you've had with tech like DeepSeek R1.

**Host 1:** Yes, do reach out to us via our social channels. And if you're working on something exciting or have insights to share, we're all ears.

**Host 2:** Until next time, keep innovating, keep coding, and stay on the frontier. I'm Alex.

**Host 1:** And I'm Charlie. Thank you for tuning in to TechFrontiers.

[Closing Jingle]`;
      }
      console.log("summary", summary);
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
        //TODO - fix
        audioUrl,
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
