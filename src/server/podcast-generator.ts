import { ArticleData, extract } from "@extractus/article-extractor";
import { ElevenLabsClient } from "elevenlabs";
import path from "node:path";
import fs from "node:fs";
import { VoiceOption } from "./server";
import { Story, fetchTopHNStories } from "./hacker-news";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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

export async function combineAudioFiles(
  audioFiles: string[],
  outputPath: string
): Promise<void> {
  console.log(`[Podcast Generator] Combining ${audioFiles.length} audio files`);

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
      `ffmpeg -f concat -safe 0 -i ${fileListPath} -c copy ${outputPath}`
    );
    console.log(
      `[Podcast Generator] Successfully combined audio files into ${outputPath}`
    );
  } catch (error) {
    console.error(`[Podcast Generator] Failed to combine audio files:`, error);
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
  storyCount: number = 5
): Promise<PodcastGenerationResult> {
  console.log(
    `[Podcast Generator] Starting podcast generation for ${storyCount} stories`
  );

  // Check if podcast already exists for today
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const podcastsDir = path.join(process.cwd(), "podcasts");
  const todayDir = path.join(podcastsDir, today);
  const metadataPath = path.join(todayDir, "metadata.json");

  console.log(
    `[Podcast Generator] Checking for existing podcast in ${todayDir}`
  );

  // Create podcasts directory if it doesn't exist
  if (!fs.existsSync(podcastsDir)) {
    console.log(
      `[Podcast Generator] Creating podcasts directory at ${podcastsDir}`
    );
    fs.mkdirSync(podcastsDir, { recursive: true });
  }

  // Create today's directory if it doesn't exist
  if (!fs.existsSync(todayDir)) {
    console.log(
      `[Podcast Generator] Creating today's directory at ${todayDir}`
    );
    fs.mkdirSync(todayDir, { recursive: true });
  }

  // Check if today's podcast already exists
  if (fs.existsSync(metadataPath)) {
    console.log(
      `[Podcast Generator] Found existing podcast for ${today}, returning cached result`
    );
    const existingPodcast = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    return existingPodcast;
  }

  console.log(
    `[Podcast Generator] No existing podcast found, generating new one`
  );

  // Fetch top HN stories
  console.log(`[Podcast Generator] Fetching top ${storyCount} HN stories`);
  const stories = await fetchTopHNStories(storyCount);
  console.log(`[Podcast Generator] Fetched ${stories.length} stories`);

  // Extract article data and generate notes for all stories
  console.log(
    `[Podcast Generator] Starting article extraction and note generation`
  );
  const articleNotesPromises = stories.map(async (story, index) => {
    console.log(
      `[Podcast Generator] Processing story ${index + 1}/${stories.length}: ${story.title}`
    );
    const articleData = await extract(story.url);
    if (!articleData) {
      console.error(
        `[Podcast Generator] Failed to extract article data from ${story.url}`
      );
      throw new Error(`Failed to extract article data from ${story.url}`);
    }
    console.log(`[Podcast Generator] Generating notes for story ${index + 1}`);
    const notes = await generatePodcastNotes(articleData);
    return {
      url: story.url,
      notes,
      title: story.title,
    };
  });

  const articleNotes = await Promise.all(articleNotesPromises);
  console.log(`[Podcast Generator] Completed note generation for all stories`);

  // Generate script from all notes
  console.log(`[Podcast Generator] Generating podcast script`);
  const script = await generatePodcastScriptFromNotes(articleNotes);
  console.log(`[Podcast Generator] Script generated successfully`);

  // Split script into lines and generate audio for each line
  const scriptLines = script.split(/[\n\r]+/).filter((line) => line.trim());
  const tempAudioFiles: string[] = [];
  console.log(
    `[Podcast Generator] Starting audio generation for ${scriptLines.length} lines`
  );

  // Generate audio for each line
  for (let i = 0; i < scriptLines.length; i++) {
    const line = scriptLines[i];
    const [host, text] = line.split(": ");
    const voiceId = VOICE_MAP[host];

    try {
      console.log(
        `[Podcast Generator] Generating audio for line ${i + 1}/${scriptLines.length} (${host})`
      );
      const audioBuffer = await createAudioFromText(text, voiceId);
      const filename = `temp_${i}.mp3`;
      const filepath = path.join(todayDir, filename);

      await fs.promises.writeFile(filepath, audioBuffer);
      tempAudioFiles.push(filepath);
      console.log(`[Podcast Generator] Saved temporary audio file ${filename}`);
    } catch (error) {
      console.error(
        `[Podcast Generator] Failed to generate audio for line ${i}:`,
        error
      );
      throw new Error(`Failed to generate audio for line ${i}`);
    }
  }

  // Combine all audio files into one
  const combinedAudioPath = path.join(todayDir, "podcast.mp3");
  await combineAudioFiles(tempAudioFiles, combinedAudioPath);

  const result: PodcastGenerationResult = {
    script,
    audioFiles: [`/podcasts/${today}/podcast.mp3`],
    notes: articleNotes.map((notes) => notes.notes),
    stories,
  };

  // Save the podcast metadata
  console.log(`[Podcast Generator] Saving podcast metadata`);
  await fs.promises.writeFile(metadataPath, JSON.stringify(result, null, 2));
  console.log(`[Podcast Generator] Podcast generation completed successfully`);

  return result;
}
