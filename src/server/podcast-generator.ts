import { ArticleData, extract } from "@extractus/article-extractor";
import { ElevenLabsClient } from "elevenlabs";
import path from "node:path";
import fs from "node:fs";
import { VoiceOption } from "./server";
import { Story, fetchTopHNStories } from "./hacker-news";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Simple logging utility with timestamps in NY timezone
const logger = {
  formatTimestamp: () => {
    const now = new Date();
    // Format: YYYY-MM-DD HH:MM:SS.mmm
    const dateStr = now
      .toLocaleString("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      .replace(",", "");

    // Add milliseconds manually
    const ms = now.getMilliseconds().toString().padStart(3, "0");
    return `${dateStr}.${ms}`;
  },
  info: (message: string) => {
    const timestamp = logger.formatTimestamp();
    console.log(`[${timestamp}] [Podcast Generator] ${message}`);
  },
  error: (message: string, error?: any) => {
    const timestamp = logger.formatTimestamp();
    console.error(`[${timestamp}] [Podcast Generator] ${message}`, error || "");
  },
  warn: (message: string) => {
    const timestamp = logger.formatTimestamp();
    console.warn(`[${timestamp}] [Podcast Generator] ${message}`);
  },
};

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export interface PodcastGenerationResult {
  script: string;
  audioFile: string;
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
Make the conversation flow naturally between topics, and ensure both hosts contribute equally to the discussion.

The tone should be casual and conversational - like a conversation between friends. For example, it could sound
something like this:

Host 1: Dude, did you hear about the blackout in Spain and Portugal?
Host 2: No way, that's fucking crazy.
Host 1: Apparently there's no internet and people are relying on radio for news.
Host 2: Wild.

The script should be in the following format:

Host 1: <line_of_dialogue>
Host 2: <line_of_dialogue>
Host 1: <line_of_dialogue>
Host 2: <line_of_dialogue>
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

export async function combineAudioFiles(
  audioFiles: string[],
  outputPath: string
): Promise<void> {
  logger.info(`Combining ${audioFiles.length} audio files`);

  // Ensure output path has a filename with extension
  if (!outputPath.endsWith(".mp3")) {
    outputPath = path.join(outputPath, "podcast.mp3");
  }

  // Ensure the directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileListPath = path.join(path.dirname(outputPath), "files.txt");

  // Create a file list for ffmpeg
  const fileList = audioFiles.map((file) => `file '${file}'`).join("\n");
  await fs.promises.writeFile(fileListPath, fileList);

  try {
    // Use ffmpeg to concatenate all audio files
    await execAsync(
      `ffmpeg -f concat -safe 0 -i ${fileListPath} -c copy ${outputPath} -y`
    );
    logger.info(`Successfully combined audio files into ${outputPath}`);
  } catch (error) {
    logger.error(`Failed to combine audio files:`, error);
    throw new Error("Failed to combine audio files");
  }

  //   try {
  //     // Clean up temporary files
  //     for (const file of audioFiles) {
  //       await fs.promises.unlink(file);
  //     }
  //     await fs.promises.unlink(fileListPath);
  //     console.log(`[Podcast Generator] Cleaned up temporary files`);
  //   } catch (error) {
  //     console.error(
  //       `[Podcast Generator] Failed to clean up temporary files:`,
  //       error
  //     );
  //   }
}

export async function generateFullPodcast(
  storyCount: number = 5,
  forceRegenerate: boolean = false
): Promise<PodcastGenerationResult> {
  logger.info(`Starting podcast generation for ${storyCount} stories`);

  // Check if podcast already exists for today
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const podcastsDir = path.join(process.cwd(), "podcasts");
  const todayDir = path.join(podcastsDir, today);
  const metadataPath = path.join(todayDir, "metadata.json");

  logger.info(`Checking for existing podcast in ${todayDir}`);

  // Create podcasts directory if it doesn't exist
  if (!fs.existsSync(podcastsDir)) {
    logger.info(`Creating podcasts directory at ${podcastsDir}`);
    fs.mkdirSync(podcastsDir, { recursive: true });
  }

  // Create today's directory if it doesn't exist
  if (!fs.existsSync(todayDir)) {
    logger.info(`Creating today's directory at ${todayDir}`);
    fs.mkdirSync(todayDir, { recursive: true });
  }

  // Check if today's podcast already exists
  if (fs.existsSync(metadataPath) && !forceRegenerate) {
    logger.info(`Found existing podcast for ${today}, returning cached result`);
    const existingPodcast = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    return existingPodcast;
  }

  if (forceRegenerate && fs.existsSync(metadataPath)) {
    logger.info(
      `Force regenerate flag set. Overwriting existing podcast for ${today}.`
    );
  }

  logger.info(
    `No existing podcast found or force regenerate requested, generating new one`
  );

  // Fetch top HN stories
  logger.info(`Fetching top ${storyCount} HN stories`);
  const stories = await fetchTopHNStories(storyCount);
  logger.info(`Fetched ${stories.length} stories`);

  // Extract article data and generate notes for all stories
  logger.info(`Starting article extraction and note generation`);
  const articleNotesPromises = stories.map(async (story, index) => {
    logger.info(
      `Processing story ${index + 1}/${stories.length}: ${story.title}`
    );
    try {
      const articleData = await extract(story.url);
      if (!articleData) {
        logger.error(
          `Failed to extract article data from ${story.url}, skipping this story`
        );
        return null;
      }
      logger.info(`Generating notes for story ${index + 1}`);
      const notes = await generatePodcastNotes(articleData);
      return {
        url: story.url,
        notes,
        title: story.title,
      };
    } catch (error) {
      logger.error(`Error processing story ${story.title}:`, error);
      return null;
    }
  });

  const articleNotes = (await Promise.all(articleNotesPromises)).filter(
    (notes): notes is NonNullable<typeof notes> => notes !== null
  );

  if (articleNotes.length === 0) {
    throw new Error("Failed to extract any articles successfully");
  }

  logger.info(`Completed note generation for ${articleNotes.length} stories`);

  // Generate script from all notes
  logger.info(`Generating podcast script`);
  const script = await generatePodcastScriptFromNotes(articleNotes);
  logger.info(`Script generated successfully`);

  // Split script into lines and generate audio for each line
  const scriptLines = script.split(/[\n\r]+/).filter((line) => line.trim());
  const tempAudioFiles: string[] = [];
  logger.info(`Starting audio generation for ${scriptLines.length} lines`);

  // Generate audio for each line
  for (let i = 0; i < scriptLines.length; i++) {
    const line = scriptLines[i];
    const [host, text] = line.split(": ");
    const voiceId = VOICE_MAP[host];

    try {
      logger.info(
        `Generating audio for line ${i + 1}/${scriptLines.length} (${host})`
      );
      const audioBuffer = await createAudioFromText(text, voiceId);
      const filename = `temp_${i}.mp3`;
      const filepath = path.join(todayDir, filename);

      await fs.promises.writeFile(filepath, audioBuffer);
      tempAudioFiles.push(filepath);
      logger.info(`Saved temporary audio file ${filename}`);
    } catch (error) {
      logger.error(`Failed to generate audio for line ${i}:`, error);
      throw new Error(`Failed to generate audio for line ${i}`);
    }
  }

  // Combine all audio files into one
  const combinedAudioPath = path.join(todayDir, "podcast.mp3");
  await combineAudioFiles(tempAudioFiles, combinedAudioPath);

  const result: PodcastGenerationResult = {
    script,
    audioFile: `/podcasts/${today}/podcast.mp3`,
    notes: articleNotes.map((notes) => notes.notes),
    stories,
  };

  // Save the podcast metadata
  logger.info(`Saving podcast metadata`);
  await fs.promises.writeFile(metadataPath, JSON.stringify(result, null, 2));
  logger.info(`Podcast generation completed successfully`);

  return result;
}
