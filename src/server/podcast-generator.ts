import { ArticleData, extract } from "@extractus/article-extractor";
import { ElevenLabsClient } from "elevenlabs";
import path from "node:path";
import fs from "node:fs";
import { VoiceOption } from "./server";
import { Story, fetchTopHNStories } from "./hacker-news";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export interface PodcastGenerationResult {
  script: string;
  audioFiles: string[];
  notes: string[];
  stories: Story[];
}

export interface ArticleNotes {
  url: string;
  notes: string;
  title: string;
}

export async function generatePodcastScriptFromNotes(
  articleNotes: ArticleNotes[]
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `
You are a helpful assistant that creates engaging podcast scripts from a collection of article notes for
two hosts who are summarizing the top articles from the Hacker News site.
The script should be a natural conversation between two hosts discussing these articles.
The hosts should weave together insights from multiple articles, making connections between them.
Do not include a sign off at the end.
The script should be in the following format:

Host 1: <line_of_dialogue>
Host 2: <line_of_dialogue>
Host 1: <line_of_dialogue>
Host 2: <line_of_dialogue>

Make the conversation flow naturally between topics, and ensure both hosts contribute equally to the discussion.
`,
        },
        {
          role: "user",
          content: `
Here are the notes from multiple articles that should be discussed in the podcast:

${articleNotes
  .map(
    (notes) => `
Article: ${notes.title}
Notes: ${notes.notes}
`
  )
  .join("\n")}
`,
        },
      ],
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function generatePodcastNotes(
  articleData: ArticleData
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `
You are a helpful assistant that reads a text article and extracts the key points. Provide as many details as would
be needed to compile a podcast episode between 2 hosts. Don't include any information that is not in the article.
Focus on the main arguments, key insights, and interesting details that would make for engaging podcast discussion.
Do not generate a script, just the notes.
`,
        },
        {
          role: "user",
          content: `
Here is the article to analyze:
${JSON.stringify(articleData)}`,
        },
      ],
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function createAudioFromText(
  text: string,
  voiceId: string
): Promise<Buffer> {
  const audioStream = await client.textToSpeech.convertAsStream(voiceId, {
    model_id: "eleven_multilingual_v2",
    text,
  });
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const VOICE_MAP: Record<string, string> = {
  "Host 1": "56AoDkrOh6qfVPDXZ7Pt", // Cassidy
  "Host 2": "UgBBYS2sOqTuMpoF3BR0", // Mark - Natural Conversations
} as const;

export async function generateFullPodcast(
  storyCount: number = 5
): Promise<PodcastGenerationResult> {
  // Check if podcast already exists for today
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const podcastsDir = path.join(process.cwd(), "podcasts");
  const todayDir = path.join(podcastsDir, today);
  const metadataPath = path.join(todayDir, "metadata.json");

  // Create podcasts directory if it doesn't exist
  if (!fs.existsSync(podcastsDir)) {
    fs.mkdirSync(podcastsDir, { recursive: true });
  }

  // Create today's directory if it doesn't exist
  if (!fs.existsSync(todayDir)) {
    fs.mkdirSync(todayDir, { recursive: true });
  }

  // Check if today's podcast already exists
  if (fs.existsSync(metadataPath)) {
    const existingPodcast = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    return existingPodcast;
  }

  // Fetch top HN stories
  const stories = await fetchTopHNStories(storyCount);

  // Extract article data and generate notes for all stories
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

  // Generate script from all notes
  const script = await generatePodcastScriptFromNotes(articleNotes);

  // Split script into lines and generate audio for each line
  const scriptLines = script.split(/[\n\r]+/).filter((line) => line.trim());
  const audioFiles: string[] = [];

  // Generate audio for each line
  for (let i = 0; i < scriptLines.length; i++) {
    const line = scriptLines[i];
    const [host, text] = line.split(": ");
    const voiceId = VOICE_MAP[host];

    try {
      const audioBuffer = await createAudioFromText(text, voiceId);
      const filename = `${i}.mp3`;
      const filepath = path.join(todayDir, filename);

      await fs.promises.writeFile(filepath, audioBuffer);
      audioFiles.push(`/podcasts/${today}/${filename}`);
    } catch (error) {
      console.error(`Failed to generate audio for line ${i}:`, error);
      throw new Error(`Failed to generate audio for line ${i}`);
    }
  }

  const result: PodcastGenerationResult = {
    script,
    audioFiles,
    notes: articleNotes.map((notes) => notes.notes),
    stories,
  };

  // Save the podcast metadata
  await fs.promises.writeFile(metadataPath, JSON.stringify(result, null, 2));

  return result;
}
