import express, { Request, Response } from "express";
import cors from "cors";
import { ElevenLabsClient } from "elevenlabs";
import path from "node:path";
import fs from "node:fs";
import { ArticleData, extract } from "@extractus/article-extractor";
import {
  generateFullPodcast,
  generatePodcastNotes,
  generatePodcastScriptFromNotes,
  getDirectPodcastAudio,
  getDirectPodcastForPlayback,
} from "./podcast-generator";
import { fetchTopHNStories } from "./hacker-news";
import fetch from "node-fetch";

// Get the podcast storage directory from environment variable or use default
const PODCASTS_DIR =
  process.env.PODCASTS_DIR || path.join(process.cwd(), "podcasts");

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export const createAudioStreamFromText = async (
  text: string,
  voice: string = "Rachel"
): Promise<Buffer> => {
  const audioStream = await client.generate({
    voice,
    model_id: "eleven_turbo_v2_5",
    text,
  });
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks);
  return content;
};

const app = express();
const router = express.Router();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173", // Vite dev server
      "http://podcastjukebox.com",
      "https://podcastjukebox.com",
      "http://localhost:3000", // Backend server
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Serve static files from the podcasts directory
router.use(
  "/podcasts",
  async (req, res, next) => {
    const failureAudioPath = path.join(
      process.cwd(),
      "public",
      "podcast_failure.m4a"
    );

    // Check if the requested file exists
    const requestedPath = path.join(PODCASTS_DIR, req.path);
    if (!fs.existsSync(requestedPath)) {
      console.warn(
        `File not found: ${requestedPath}, serving failure audio instead`
      );
      res.sendFile(failureAudioPath);
      return;
    }

    try {
      // Check file size
      const stats = await fs.promises.stat(requestedPath);
      if (stats.size === 0) {
        console.warn(
          `File is empty: ${requestedPath}, serving failure audio instead`
        );
        res.sendFile(failureAudioPath);
        return;
      }

      // If we have a range request, verify the range is valid
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

        if (start >= stats.size || end >= stats.size) {
          console.warn(
            `Invalid range request for ${requestedPath}, serving failure audio instead`
          );
          res.sendFile(failureAudioPath);
          return;
        }
      }

      // If we get here, the file exists and is valid
      next();
    } catch (error) {
      console.error(`Error checking file ${requestedPath}:`, error);
      res.sendFile(failureAudioPath);
    }
  },
  express.static(PODCASTS_DIR, {
    setHeaders: (res, path) => {
      // Set appropriate headers for audio files
      if (path.endsWith(".mp3")) {
        res.set("Content-Type", "audio/mpeg");
      } else if (path.endsWith(".m4a")) {
        res.set("Content-Type", "audio/mp4");
      }
    },
  })
);

export type VoiceOption = "Rachel" | "Daniel";

export interface TextToSpeechRequest {
  text: string;
  voice: VoiceOption;
}

const ENABLE_TEST = false;

interface GetEphemeralKeyRequest {
  prompt: string;
}

router.post("/get-ephemeral-key", async (req, res) => {
  const { prompt } = req.body as GetEphemeralKeyRequest;

  const tokenResponse = await fetch(
    "https://api.openai.com/v1/realtime/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "sage",
        instructions: prompt,
      }),
    }
  );

  const data = await tokenResponse.json();

  res.setHeader("Content-Type", "application/json");
  res.status(200).json(data);
});

router.get("/healthcheck", (_, res) => {
  res.status(200).send("OK");
});

// Debug endpoint: Generate notes for the first HN story
router.post("/debug/generate-notes", async (_, res) => {
  try {
    const stories = await fetchTopHNStories(1);
    if (stories.length === 0) {
      throw new Error("No stories found");
    }

    const story = stories[0];
    const articleData = await extract(story.url);
    if (!articleData) {
      throw new Error("Failed to extract article data");
    }

    const notes = await generatePodcastNotes(articleData);

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      story,
      notes,
    });
  } catch (error: unknown) {
    console.error("Failed to generate notes:", error);
    res.status(500).json({ error });
  }
});

// Debug endpoint: Generate script from first two HN stories
router.post("/debug/generate-script", async (_, res) => {
  try {
    const stories = await fetchTopHNStories(2);
    if (stories.length < 2) {
      throw new Error("Not enough stories found");
    }

    const articleNotesPromises = stories.map(async (story) => {
      const articleData = await extract(story.url);
      if (!articleData) {
        throw new Error(`Failed to extract article data from ${story.url}`);
      }
      const notes = await generatePodcastNotes(articleData);
      return {
        url: story.url,
        notes,
        title: story.title,
      };
    });

    const articleNotes = await Promise.all(articleNotesPromises);
    const script = await generatePodcastScriptFromNotes(
      articleNotes.map((notes) => ({
        ...notes,
        contentType: "text" as const,
      }))
    );

    res.json({
      stories,
      script,
      notes: articleNotes.map((notes) => notes.notes),
    });
  } catch (error) {
    console.error("Failed to generate script:", error);
    res.status(500).json({ error });
  }
});

// Endpoint for generating a full podcast
router.post("/generate-podcast", async (req, res) => {
  try {
    const { rssFeedUrl, storyCount } = req.body as {
      rssFeedUrl?: string;
      storyCount?: number;
    };

    let result;
    if (rssFeedUrl) {
      // Generate podcast from RSS feed
      result = await generateFullPodcast(rssFeedUrl);
    } else {
      // Generate podcast from Hacker News
      const stories = await fetchTopHNStories(storyCount || 5);
      const articleNotesPromises = stories.map(async (story) => {
        const articleData = await extract(story.url);
        if (!articleData) {
          throw new Error(`Failed to extract article data from ${story.url}`);
        }
        const notes = await generatePodcastNotes(articleData);
        return {
          url: story.url,
          notes,
          title: story.title,
          contentType: "text" as const,
        };
      });

      const articleNotes = await Promise.all(articleNotesPromises);
      const script = await generatePodcastScriptFromNotes(articleNotes);
      result = {
        script,
        audioFile: "", // This will be set by the podcast generator
        notes: articleNotes.map((notes) => notes.notes),
        feedItems: stories,
      };
    }

    // Handle direct playback URLs differently
    if (result.audioFile.startsWith("http")) {
      // For direct playback, use the URL as is
      const feedItem = result.feedItems[0];
      const feedInfo = "feedInfo" in feedItem ? feedItem.feedInfo : undefined;

      res.json({
        ...result,
        isDirectPlayback: true,
        directPlaybackInfo: {
          title: result.script.replace("Direct podcast playback: ", ""),
          audioUrl: result.audioFile,
          feedInfo,
        },
      });
    } else {
      // For generated podcasts, convert the file system path to a web-accessible URL
      const relativePath = path.relative(process.cwd(), result.audioFile);
      const audioUrl = `/${relativePath.replace(/\\/g, "/")}`;

      res.json({
        ...result,
        audioFile: audioUrl,
      });
    }
  } catch (error) {
    console.error("Failed to generate podcast:", error);
    res.status(500).json({ error: "Failed to generate podcast" });
  }
});

// Endpoint for direct podcast audio access with transcription
router.post("/direct-podcast", async (req, res) => {
  try {
    const { rssFeedUrl, forceRegenerate } = req.body as {
      rssFeedUrl: string;
      forceRegenerate?: boolean;
    };

    if (!rssFeedUrl) {
      res.status(400).json({ error: "RSS feed URL is required" });
      return;
    }

    const result = await getDirectPodcastAudio(
      rssFeedUrl,
      forceRegenerate || false
    );

    if (!result) {
      res
        .status(404)
        .json({ error: "No audio episodes found in the RSS feed" });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error("Failed to process direct podcast:", error);
    res.status(500).json({ error: "Failed to process direct podcast" });
  }
});

// Endpoint for simple podcast playback info (no transcription)
router.post("/podcast-playback", async (req, res) => {
  try {
    const { rssFeedUrl, forceRegenerate } = req.body as {
      rssFeedUrl: string;
      forceRegenerate?: boolean;
    };

    if (!rssFeedUrl) {
      res.status(400).json({ error: "RSS feed URL is required" });
      return;
    }

    const result = await getDirectPodcastForPlayback(
      rssFeedUrl,
      forceRegenerate || false
    );

    if (!result) {
      res
        .status(404)
        .json({ error: "No audio episodes found in the RSS feed" });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error("Failed to get podcast playback info:", error);
    res.status(500).json({ error: "Failed to get podcast playback info" });
  }
});

// Image proxy endpoint to handle CORS and 403 errors
// @ts-ignore - TypeScript router signature issue
router.get("/proxy-image", async (req, res) => {
  const imageUrl = req.query.url as string;

  if (!imageUrl) {
    return res.status(400).json({ error: "Image URL is required" });
  }

  try {
    // Add more robust headers for favicon requests
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: new URL(imageUrl).origin,
    };

    // Add specific headers for favicon requests
    if (imageUrl.includes("favicon")) {
      headers["Accept"] = "image/x-icon,image/*,*/*;q=0.8";
    }

    const response = await fetch(imageUrl, { headers });

    if (!response.ok) {
      console.error(
        `Failed to fetch image: ${response.status} ${response.statusText}`
      );
      return res.status(404).json({ error: "Image not found" });
    }

    // Get the image as a buffer
    const imageBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);

    // Forward the content type
    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Length", buffer.length);

    // Send the buffer
    res.send(buffer);
  } catch (error) {
    console.error("Error proxying image:", error);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

if (process.env.NODE_ENV !== "development") {
  app.use("/", router);
} else {
  app.use("/api", router);
}

// Handle 404 for unknown routes
app.use((_, res) => {
  res.status(404).send("Not Found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
