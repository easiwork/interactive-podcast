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

// Serve static files from the podcasts directory with error handling
router.use("/podcasts", (req, res, next) => {
  const staticHandler = express.static(PODCASTS_DIR);
  staticHandler(req, res, (err) => {
    if (err) {
      console.error(
        `[${new Date().toISOString()}] Static file serving error for ${req.path}:`,
        err.message
      );

      // Handle Range Not Satisfiable and other file serving errors
      if (
        err.message?.includes("Range Not Satisfiable") ||
        err.status === 416 ||
        err.statusCode === 416
      ) {
        console.error(
          `Range Not Satisfiable error for ${req.path}. Redirecting to failure audio.`
        );
        return res.redirect("/podcast_fail.m4a");
      }

      // For other static file errors, also redirect to failure audio
      if (err.status >= 400) {
        console.error(
          `Static file error (${err.status}) for ${req.path}. Redirecting to failure audio.`
        );
        return res.redirect("/podcast_fail.m4a");
      }
    }
    next(err);
  });
});

// Serve static files from the public directory
router.use("/", express.static(path.join(process.cwd(), "public")));

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

// New reload endpoint for processing feeds on demand
router.get("/reload", async (req, res) => {
  try {
    const { date, force } = req.query as {
      date?: string;
      force?: string;
    };

    // Parse the date parameter or use current date
    const targetDate = date ? new Date(date) : new Date();
    const dateString = targetDate.toISOString().split("T")[0]; // YYYY-MM-DD format

    // Parse the force parameter
    const forceRegenerate = force === "true";

    console.log(
      `Reload endpoint called - Date: ${dateString}, Force: ${forceRegenerate}`
    );

    // For now, return the processing date - in the future this could trigger
    // background processing of all feeds or specific feed processing
    res.json({
      message: "Reload endpoint ready",
      lastProcessingDate: dateString,
      force: forceRegenerate,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to process reload:", error);
    res.status(500).json({ error: "Failed to process reload request" });
  }
});

// Endpoint for generating a full podcast
router.post("/generate-podcast", async (req, res) => {
  try {
    const { rssFeedUrl, storyCount, force } = req.body as {
      rssFeedUrl?: string;
      storyCount?: number;
      force?: boolean;
    };

    let result;
    if (rssFeedUrl) {
      // Generate podcast from RSS feed
      result = await generateFullPodcast(rssFeedUrl, force || false);
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
      // Check if this is a failed podcast
      if (result.failed && result.audioFile.includes("podcast_fail.m4a")) {
        // Return the failure audio as a web-accessible URL
        res.json({
          ...result,
          audioFile: "/podcast_fail.m4a",
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

// Global error handler for unhandled errors
app.use((err: any, req: any, res: any, next: any) => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, err.message);

  // Handle Range Not Satisfiable errors globally
  if (
    err.message?.includes("Range Not Satisfiable") ||
    err.status === 416 ||
    err.statusCode === 416
  ) {
    console.error(
      `Global Range Not Satisfiable error for ${req.path}. Redirecting to failure audio.`
    );
    return res.redirect("/podcast_fail.m4a");
  }

  // Handle other file serving errors
  if (err.status >= 400 && err.status < 500) {
    console.error(`Global client error (${err.status}) for ${req.path}.`);
    return res
      .status(err.status)
      .json({ error: err.message || "Client error" });
  }

  // Handle server errors
  console.error(`Global server error for ${req.path}:`, err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
