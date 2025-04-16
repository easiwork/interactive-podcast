import express from "express";
import cors from "cors";
import { ElevenLabsClient } from "elevenlabs";
import path from "node:path";
import fs from "node:fs";
import { ArticleData, extract } from "@extractus/article-extractor";
import {
  generateFullPodcast,
  generatePodcastNotes,
  generatePodcastScriptFromNotes,
} from "./podcast-generator";
import { fetchTopHNStories } from "./hacker-news";

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
app.use(cors());

// Serve static files from the podcasts directory
app.use("/podcasts", express.static(path.join(process.cwd(), "podcasts")));

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
    const script = await generatePodcastScriptFromNotes(articleNotes);

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
    const { storyCount = 5 } = req.body as { storyCount?: number };
    const result = await generateFullPodcast(storyCount);
    res.json(result);
  } catch (error) {
    console.error("Failed to generate podcast:", error);
    res.status(500).json({ error: "Failed to generate podcast" });
  }
});

// if (process.env.NODE_ENV !== "development") {
app.use("/", router);
// } else {
//   app.use("/api", router);
// }

// Handle 404 for unknown routes
app.use((_, res) => {
  res.status(404).send("Not Found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
