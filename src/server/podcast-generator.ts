import { ArticleData, extract } from "@extractus/article-extractor";
import { ElevenLabsClient } from "elevenlabs";
import path from "node:path";
import fs from "node:fs";
import { VoiceOption } from "./server";
import {
  FeedItem,
  fetchAndParseRSS,
  fetchRSSFeedInfo,
} from "./rss-feed-parser";
import { exec } from "child_process";
import { promisify } from "util";
import { podcastScriptPrompt } from "./podcast-script-prompt";
import { transcribeAudioFromUrl } from "./audio-utils";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import os from "node:os";

const execAsync = promisify(exec);

// Get the podcast storage directory from environment variable or use default
const PODCASTS_DIR =
  process.env.PODCASTS_DIR || path.join(process.cwd(), "podcasts");

// Utility function to get local date string in YYYY-MM-DD format
function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  feedItems: FeedItem[];
  failed?: boolean;
  failureReason?: string;
}

export interface ArticleNotes {
  url: string;
  notes: string;
  title: string;
  contentType: "text" | "audio";
  originalAudioUrl?: string;
}

export interface DirectPodcastResult {
  title: string;
  audioUrl: string;
  transcription: string;
  pubDate?: string;
  notes: string;
  feedItem: FeedItem;
}

export interface DirectPodcastPlayback {
  title: string;
  audioUrl: string;
  pubDate?: string;
  description?: string;
  feedItem: FeedItem;
  cachedAudioFile?: string; // Local cached version if available
  imageUrl?: string;
  faviconUrl?: string;
  feedInfo?: {
    title?: string;
    imageUrl?: string;
    link?: string;
    itunes?: { image?: string };
  };
  feedItems: FeedItem[];
}

// Added interface for OpenAI Chat Completion Response
interface OpenAIChatCompletionResponse {
  choices: {
    message: {
      content: string;
    };
    // ... other properties like finish_reason, index can be added if needed
  }[];
  // ... other top-level properties like id, object, created, model, usage can be added if needed
}

function getFaviconUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`;
  } catch {
    // Fallback for invalid URLs
    return `https://www.google.com/s2/favicons?domain=example.com&sz=64`;
  }
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
          content: podcastScriptPrompt,
        },
        {
          role: "user",
          content: `
Here are the notes from multiple articles that should be discussed in the podcast:

${articleNotes
  .map(
    (notes) => `
Article Title: ${notes.title}
Content Type: ${notes.contentType}
${notes.contentType === "audio" && notes.originalAudioUrl ? `Original Audio URL: ${notes.originalAudioUrl}\n` : ""}Source URL: ${notes.url}
Notes: ${notes.notes}
`
  )
  .join("\n\n")}
`,
        },
      ],
    }),
  });

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  if (
    !data.choices ||
    data.choices.length === 0 ||
    !data.choices[0].message ||
    !data.choices[0].message.content
  ) {
    logger.error(
      "Invalid response structure from OpenAI for script generation:",
      data
    );
    throw new Error("Failed to parse script from OpenAI response");
  }
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

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  if (
    !data.choices ||
    data.choices.length === 0 ||
    !data.choices[0].message ||
    !data.choices[0].message.content
  ) {
    logger.error(
      "Invalid response structure from OpenAI for notes generation:",
      data
    );
    throw new Error("Failed to parse notes from OpenAI response");
  }
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
  rssFeedUrl: string,
  forceRegenerate: boolean = false
): Promise<PodcastGenerationResult> {
  logger.info(`Starting podcast generation from RSS feed: ${rssFeedUrl}`);

  // Check if podcast already exists for today
  const feedId = rssFeedUrl.replace(/[^a-zA-Z0-9]/g, "_");
  const today = getLocalDateString();
  const feedSpecificDir = path.join(PODCASTS_DIR, feedId, today);
  const metadataPath = path.join(feedSpecificDir, "metadata.json");

  logger.info(`Checking for existing podcast in ${feedSpecificDir}`);

  // Create podcasts directory if it doesn't exist
  if (!fs.existsSync(PODCASTS_DIR)) {
    logger.info(`Creating podcasts directory at ${PODCASTS_DIR}`);
    fs.mkdirSync(PODCASTS_DIR, { recursive: true });
  }

  // Create feed-specific and today's directory if it doesn't exist
  if (!fs.existsSync(feedSpecificDir)) {
    logger.info(`Creating feed-specific directory at ${feedSpecificDir}`);
    fs.mkdirSync(feedSpecificDir, { recursive: true });
  }

  // Check if today's podcast already exists
  if (fs.existsSync(metadataPath) && !forceRegenerate) {
    logger.info(
      `Found existing podcast for feed ${rssFeedUrl} on ${today}, returning cached result`
    );
    const existingPodcast = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    return existingPodcast;
  }

  if (forceRegenerate && fs.existsSync(metadataPath)) {
    logger.info(
      `Force regenerate flag set. Overwriting existing podcast for feed ${rssFeedUrl} on ${today}.`
    );
  }

  logger.info(
    `No existing podcast found or force regenerate requested, generating new one for feed ${rssFeedUrl}`
  );

  // Fetch all feed items to analyze feed type
  const allFeedItems = await fetchAndParseRSS(rssFeedUrl);

  // Determine feed type by analyzing first 5 items (or all if fewer)
  const sampleSize = Math.min(5, allFeedItems.length);
  const sampleItems = allFeedItems.slice(0, sampleSize);
  const audioItemCount = sampleItems.filter(
    (item) => item.contentType === "audio"
  ).length;
  const isPodcastFeed = audioItemCount > sampleSize / 2; // More than half are audio items

  // Set maxItems based on feed type
  const maxItems = isPodcastFeed ? 1 : 5;

  logger.info(
    `Feed analysis: ${audioItemCount}/${sampleSize} items are audio. Determined feed type: ${isPodcastFeed ? "PODCAST" : "NEWS/TEXT"}. Will collect ${maxItems} item(s).`
  );

  // For podcast feeds, use direct playback instead of generating a new podcast
  if (isPodcastFeed) {
    logger.info(
      `Podcast feed detected. Using direct playback approach instead of podcast generation.`
    );
    const directPlayback = await getDirectPodcastForPlayback(
      rssFeedUrl,
      forceRegenerate
    );

    if (!directPlayback) {
      logger.warn(
        `No audio episodes found for direct playback in RSS feed ${rssFeedUrl}.`
      );
      const emptyScript = "No audio episodes available for direct playback.";
      const emptyAudioFilePath = path.join(feedSpecificDir, "no_episodes.txt");
      await fs.promises.writeFile(
        emptyAudioFilePath,
        "No audio episodes found"
      );

      const result: PodcastGenerationResult = {
        script: emptyScript,
        audioFile: emptyAudioFilePath,
        notes: ["No audio episodes found in this podcast feed"],
        feedItems: [],
      };
      await fs.promises.writeFile(
        metadataPath,
        JSON.stringify(result, null, 2)
      );
      return result;
    }

    // Return the direct playback info formatted as a PodcastGenerationResult
    const result: PodcastGenerationResult = {
      script: `Direct podcast playback: ${directPlayback.title}`,
      audioFile: directPlayback.audioUrl, // Use the original URL directly
      notes: [directPlayback.description || "No description available"],
      feedItems: [directPlayback.feedItem],
    };

    // Also save the direct playback metadata
    await fs.promises.writeFile(
      metadataPath,
      JSON.stringify(
        {
          ...result,
          isDirectPlayback: true,
          directPlaybackInfo: directPlayback,
        },
        null,
        2
      )
    );

    logger.info(
      `Direct podcast playback setup completed for: ${directPlayback.title}`
    );
    return result;
  }

  const feedItemsToProcess = allFeedItems.slice(0, maxItems);

  if (feedItemsToProcess.length === 0) {
    logger.warn(`No items found in RSS feed ${rssFeedUrl} or maxItems is 0.`);
    const emptyScript = "No content available for today's podcast.";
    const emptyAudioDir = path.join(feedSpecificDir, "empty_audio");
    if (!fs.existsSync(emptyAudioDir))
      fs.mkdirSync(emptyAudioDir, { recursive: true });
    const emptyAudioFilePath = path.join(emptyAudioDir, "empty.mp3");

    try {
      const host1Voice = VOICE_MAP["Host 1"];
      const audioBuffer = await createAudioFromText(
        "No content available.",
        host1Voice
      );
      await fs.promises.writeFile(emptyAudioFilePath, audioBuffer);
      logger.info(`Generated empty placeholder audio at ${emptyAudioFilePath}`);
    } catch (ttsError) {
      logger.error(
        "Failed to generate placeholder audio for empty podcast",
        ttsError
      );
      // Fallback: create a truly empty file if TTS fails
      await fs.promises.writeFile(emptyAudioFilePath, "");
    }

    const result: PodcastGenerationResult = {
      script: emptyScript,
      audioFile: emptyAudioFilePath,
      notes: [],
      feedItems: [],
    };
    await fs.promises.writeFile(metadataPath, JSON.stringify(result, null, 2));
    return result;
  }

  logger.info(
    `Fetched ${feedItemsToProcess.length} items from RSS feed. Processing them now.`
  );

  const articleNotesPromises = feedItemsToProcess.map(async (item) => {
    logger.info(`Processing item: ${item.title || "Untitled Item"}`);
    if (item.contentType === "text") {
      if (!item.link && !item.content) {
        logger.warn(
          `Skipping item "${item.title || "Untitled Text Item"}" due to missing link and content.`
        );
        return null;
      }
      try {
        let articleData: ArticleData | null = null;
        let sourceUrl =
          item.link ||
          `text-item:${item.title?.replace(/\s/g, "_") || "untitled"}`;
        let usedFallbackContent = false;

        if (item.link) {
          logger.info(
            `Attempting to extract content from URL: ${item.link} for item "${item.title}"`
          );
          try {
            articleData = await extract(item.link);
            if (!articleData?.content) {
              logger.warn(
                `Extraction from ${item.link} yielded no content. Will check RSS content.`
              );
              articleData = null; // Ensure we hit the fallback logic if content is empty
            }
          } catch (extractionError: any) {
            logger.warn(
              `Failed to extract content from URL ${item.link} (Error: ${extractionError.message}). Checking RSS content fallback.`
            );
            // Do not return null yet, try the fallback.
          }
        }

        // Fallback to item.content from RSS if extraction failed or no link, or extraction yielded no content
        if (!articleData && item.content) {
          logger.info(
            `Using content directly from RSS feed for item "${item.title}" (length: ${item.content.length}).`
          );
          articleData = {
            url: sourceUrl, // Still use the original link if available, or the generated one
            title: item.title,
            content: item.content, // Use content from RSS
            description: undefined,
            image: undefined,
            author: undefined,
            published: item.pubDate,
            ttr: undefined, // Might not be possible to calculate accurately
            source: rssFeedUrl,
          };
          usedFallbackContent = true;
        } else if (item.link && !articleData && !item.content) {
          // Only if there was a link, extraction failed, AND no RSS content
          logger.warn(
            `Extraction from ${item.link} failed and no RSS content fallback available for "${item.title || "Untitled Text Item"}". Skipping.`
          );
          return null;
        }

        if (!articleData || !articleData.content) {
          logger.warn(
            `Could not get content for "${item.title || "Untitled Text Item"}" from ${item.link || "RSS feed"}. Skipping.`
          );
          return null;
        }

        if (usedFallbackContent) {
          logger.info(
            `Successfully used RSS content for notes generation for "${item.title}".`
          );
        } else {
          logger.info(
            `Successfully extracted article content for notes generation for "${item.title}".`
          );
        }

        const notes = await generatePodcastNotes(articleData);
        return {
          url: sourceUrl,
          notes,
          title: item.title || articleData.title || "Untitled Article",
          contentType: "text",
        };
      } catch (e: any) {
        logger.error(
          `Failed to process text article "${item.title || "Untitled Text Item"}" (source: ${item.link || "provided content"}): ${e.message}`
        );
        return null;
      }
    } else if (item.contentType === "audio") {
      logger.info(
        `Processing audio item: "${item.title || "Untitled Audio Item"}". Attempting transcription.`
      );
      if (!item.audioUrl) {
        logger.warn(
          `Skipping audio item "${item.title || "Untitled Audio Item"}" due to missing audioUrl.`
        );
        return null;
      }
      const sourceUrl = item.audioUrl;

      const transcribedText = await transcribeAudioFromUrl(item.audioUrl);

      if (transcribedText === null) {
        logger.error(
          `Transcription failed for "${item.title || "Untitled Audio Item"}" from ${item.audioUrl}. Skipping.`
        );
        return null;
      }
      if (transcribedText.trim() === "") {
        logger.warn(
          `Transcription resulted in empty text for "${item.title || "Untitled Audio Item"}" from ${item.audioUrl}. Skipping.`
        );
        return null;
      }

      logger.info(
        `Successfully transcribed audio for "${item.title || "Untitled Audio Item"}". Length: ${transcribedText.length} chars.`
      );

      const pseudoArticleData: ArticleData = {
        title: item.title || "Untitled Audio Track",
        content: transcribedText,
        url: sourceUrl,
        published: item.pubDate,
        source: rssFeedUrl,
      };
      try {
        const notes = await generatePodcastNotes(pseudoArticleData);
        return {
          url: sourceUrl,
          notes,
          title: item.title || "Untitled Audio Track",
          contentType: "audio",
          originalAudioUrl: item.audioUrl,
        };
      } catch (e: any) {
        logger.error(
          `Failed to generate notes for audio item "${item.title || "Untitled Audio Item"}" (source: ${item.audioUrl}): ${e.message}`
        );
        return null;
      }
    } else {
      logger.warn(
        `Unknown content type for item: ${item.title || "Untitled Item"}`
      );
      return null;
    }
  });

  const resolvedArticleNotes = (await Promise.all(articleNotesPromises)).filter(
    (notes): notes is ArticleNotes => notes !== null
  );

  if (resolvedArticleNotes.length === 0) {
    logger.warn(
      `No articles could be processed into notes from RSS feed ${rssFeedUrl}.`
    );
    // Handle case where no notes could be generated (similar to no items found)
    const emptyScript =
      "No processable content found in the feed items for today's podcast.";
    const emptyAudioDir = path.join(feedSpecificDir, "empty_notes_audio");
    if (!fs.existsSync(emptyAudioDir))
      fs.mkdirSync(emptyAudioDir, { recursive: true });
    const emptyAudioFilePath = path.join(emptyAudioDir, "empty.mp3");

    try {
      const host1Voice = VOICE_MAP["Host 1"];
      const audioBuffer = await createAudioFromText(
        "No processable content available.",
        host1Voice
      );
      await fs.promises.writeFile(emptyAudioFilePath, audioBuffer);
      logger.info(`Generated empty placeholder audio at ${emptyAudioFilePath}`);
    } catch (ttsError) {
      logger.error(
        "Failed to generate placeholder audio for empty notes",
        ttsError
      );
      await fs.promises.writeFile(emptyAudioFilePath, ""); // fallback to truly empty
    }

    const result: PodcastGenerationResult = {
      script: emptyScript,
      audioFile: emptyAudioFilePath,
      notes: [],
      feedItems: feedItemsToProcess, // Still include the items we attempted to process
    };
    await fs.promises.writeFile(metadataPath, JSON.stringify(result, null, 2));
    return result;
  }

  logger.info(
    `Successfully generated notes for ${resolvedArticleNotes.length} items.`
  );

  // Generate podcast script from the collected notes
  logger.info("Generating podcast script from notes");
  const script = await generatePodcastScriptFromNotes(resolvedArticleNotes); // Use filtered notes

  // Split script into segments for different hosts
  const scriptLines = script.split(/[\n\r]+/).filter((line) => line.trim());
  const tempAudioFiles: string[] = [];
  logger.info(`Starting audio generation for ${scriptLines.length} lines`);

  // Generate audio for each line or handle placeholder for original audio
  for (let i = 0; i < scriptLines.length; i++) {
    const line = scriptLines[i].trim();

    // Check for PLAY_ORIGINAL_AUDIO placeholder
    const playOriginalAudioMatch = line.match(/\[PLAY_ORIGINAL_AUDIO: (.*?)\]/);

    if (playOriginalAudioMatch && playOriginalAudioMatch[1]) {
      const originalAudioUrl = playOriginalAudioMatch[1];
      logger.info(
        `Encountered PLAY_ORIGINAL_AUDIO placeholder for URL: ${originalAudioUrl}`
      );
      let tempOriginalAudioPath: string | null = null;
      try {
        const response = await fetch(originalAudioUrl);
        if (!response.ok || !response.body) {
          throw new Error(
            `Failed to download original audio: ${response.statusText} from ${originalAudioUrl}`
          );
        }

        // Try to get a reasonable extension
        const contentType = response.headers.get("content-type");
        const extension = contentType?.includes("mpeg")
          ? ".mp3"
          : contentType?.includes("wav")
            ? ".wav"
            : contentType?.includes("aac")
              ? ".aac"
              : contentType?.includes("ogg")
                ? ".ogg"
                : contentType?.includes("flac")
                  ? ".flac"
                  : ".mp3"; // Default

        tempOriginalAudioPath = path.join(
          feedSpecificDir,
          `original_audio_${uuidv4()}${extension}`
        );

        logger.info(
          `Downloading original audio from ${originalAudioUrl} to ${tempOriginalAudioPath}`
        );
        const fileStream = fs.createWriteStream(tempOriginalAudioPath);
        await new Promise((resolve, reject) => {
          response.body!.pipe(fileStream);
          response.body!.on("error", reject);
          fileStream.on("finish", resolve);
        });

        tempAudioFiles.push(tempOriginalAudioPath);
        logger.info(`Saved original audio segment to ${tempOriginalAudioPath}`);
      } catch (error) {
        logger.error(
          `Failed to download or save original audio from ${originalAudioUrl}:`,
          error
        );
        // Optionally, insert a short TTS saying "Error playing audio clip"
        try {
          const errorText =
            "We experienced an error trying to play an audio clip.";
          const host1Voice = VOICE_MAP["Host 1"]; // Or a generic voice
          const audioBuffer = await createAudioFromText(errorText, host1Voice);
          const errorFilename = `temp_error_audio_${i}.mp3`;
          const errorFilepath = path.join(feedSpecificDir, errorFilename);
          await fs.promises.writeFile(errorFilepath, audioBuffer);
          tempAudioFiles.push(errorFilepath);
          logger.warn(
            `Inserted placeholder TTS for failed original audio clip at segment ${i}`
          );
        } catch (ttsError) {
          logger.error(
            `Failed to generate placeholder TTS for failed original audio:`,
            ttsError
          );
          // If TTS also fails, we just skip this segment for now.
        }
      }
    } else {
      // Process as regular host dialogue
      const parts = line.split(": ");
      if (parts.length < 2) {
        logger.warn(
          `Skipping malformed script line (expected 'Host: Text'): "${line}"`
        );
        continue;
      }
      const host = parts[0];
      const text = parts.slice(1).join(": "); // Re-join if text contained ':'
      const voiceId = VOICE_MAP[host];

      if (!voiceId) {
        logger.warn(
          `Skipping line due to unknown host: "${host}" in line: "${line}"`
        );
        continue;
      }
      if (!text || text.trim() === "") {
        logger.warn(
          `Skipping line with empty text for host "${host}": "${line}"`
        );
        continue;
      }

      try {
        logger.info(
          `Generating audio for line ${i + 1}/${scriptLines.length} (${host})`
        );
        const audioBuffer = await createAudioFromText(text, voiceId);
        const filename = `temp_tts_${i}_${host.replace(/\s+/g, "_")}.mp3`;
        const filepath = path.join(feedSpecificDir, filename);

        await fs.promises.writeFile(filepath, audioBuffer);
        tempAudioFiles.push(filepath);
        logger.info(`Saved TTS audio file ${filepath}`);
      } catch (error: any) {
        logger.error(
          `Failed to generate TTS audio for line ${i} ("${line}"):`,
          error
        );

        // Check if this is a critical failure (like API authentication)
        if (
          error.statusCode === 401 ||
          error.message?.includes("Status code: 401")
        ) {
          logger.error(
            `Critical TTS failure detected (401 Unauthorized). Cancelling podcast generation.`
          );

          // Create failure result with podcast_fail.m4a
          const failAudioPath = path.join(
            process.cwd(),
            "public",
            "podcast_fail.m4a"
          );
          const result: PodcastGenerationResult = {
            script: "Podcast generation failed due to authentication error",
            audioFile: failAudioPath,
            notes: ["Podcast generation failed"],
            feedItems: feedItemsToProcess,
            failed: true,
            failureReason: "TTS API authentication failed",
          };

          // Save the failure metadata
          await fs.promises.writeFile(
            metadataPath,
            JSON.stringify(result, null, 2)
          );
          logger.info(`Podcast generation failed - saved failure metadata`);
          return result;
        }

        // For non-critical errors, continue but log the issue
        logger.warn(`Non-critical TTS error, continuing generation...`);
      }
    }
  }

  // Combine all audio files into one
  // Ensure there are actual audio files to combine
  if (tempAudioFiles.length === 0) {
    logger.warn(
      "No audio segments were generated or downloaded. Creating an empty/placeholder podcast."
    );
    // Create a truly empty or very short silent mp3.
    // This logic could be identical to the one for "no items found" or "no notes generated"
    const emptyScriptForNoAudio =
      "An error occurred, and no audio content could be assembled for the podcast.";
    const emptyAudioFilePath = path.join(feedSpecificDir, "empty_final.mp3");
    try {
      const host1Voice = VOICE_MAP["Host 1"];
      const audioBuffer = await createAudioFromText(
        "No audio content available.",
        host1Voice
      );
      await fs.promises.writeFile(emptyAudioFilePath, audioBuffer);
    } catch (ttsError: any) {
      logger.error(
        "Failed to generate placeholder audio for no-audio-segments case",
        ttsError
      );

      // Check if this is a critical failure
      if (
        ttsError.statusCode === 401 ||
        ttsError.message?.includes("Status code: 401")
      ) {
        logger.error(
          `Critical TTS failure in fallback audio generation. Using podcast_fail.m4a`
        );
        const failAudioPath = path.join(
          process.cwd(),
          "public",
          "podcast_fail.m4a"
        );
        const result: PodcastGenerationResult = {
          script: script || emptyScriptForNoAudio,
          audioFile: failAudioPath,
          notes: resolvedArticleNotes.map((notes) => notes.notes),
          feedItems: feedItemsToProcess,
          failed: true,
          failureReason: "TTS API authentication failed in fallback generation",
        };
        await fs.promises.writeFile(
          metadataPath,
          JSON.stringify(result, null, 2)
        );
        return result;
      }

      await fs.promises.writeFile(emptyAudioFilePath, ""); // fallback
    }

    const result: PodcastGenerationResult = {
      script: script || emptyScriptForNoAudio, // Use original script if available, else placeholder
      audioFile: emptyAudioFilePath,
      notes: resolvedArticleNotes.map((notes) => notes.notes),
      feedItems: feedItemsToProcess,
    };
    await fs.promises.writeFile(metadataPath, JSON.stringify(result, null, 2));
    logger.info(
      `Podcast generation completed with placeholder audio due to no segments.`
    );
    return result;
  }

  // const combinedAudioPath = path.join(feedSpecificDir, "podcast_segments"); // Old: this was a directory
  const finalCombinedAudioPath = path.join(feedSpecificDir, "podcast.mp3"); // New: This is the final file path
  // await combineAudioFiles(tempAudioFiles, combinedAudioPath); // Old

  try {
    await combineAudioFiles(tempAudioFiles, finalCombinedAudioPath); // New
    logger.info(
      `Successfully combined all audio segments into ${finalCombinedAudioPath}`
    );

    // Validate that the combined audio file exists and has content
    try {
      const stats = await fs.promises.stat(finalCombinedAudioPath);
      if (stats.size === 0) {
        throw new Error("Generated audio file is empty");
      }
      logger.info(`Generated audio file is valid, size: ${stats.size} bytes`);
    } catch (statError: any) {
      throw new Error(
        `Generated audio file validation failed: ${statError.message}`
      );
    }
  } catch (combineError: any) {
    logger.error(
      `Failed to combine audio files. Error: ${combineError.message}`,
      combineError
    );

    // Return failure result with podcast_fail.m4a
    const failAudioPath = path.join(
      process.cwd(),
      "public",
      "podcast_fail.m4a"
    );
    const result: PodcastGenerationResult = {
      script,
      audioFile: failAudioPath,
      notes: resolvedArticleNotes.map((notes) => notes.notes),
      feedItems: feedItemsToProcess,
      failed: true,
      failureReason: "Failed to combine audio segments",
    };

    // Save the failure metadata
    await fs.promises.writeFile(metadataPath, JSON.stringify(result, null, 2));
    logger.info(
      `Podcast generation failed during audio combination - saved failure metadata`
    );
    return result;
  }

  const result: PodcastGenerationResult = {
    script,
    // audioFile: `/podcasts/${feedId}/${today}/podcast.mp3`, // Old path structure in result
    audioFile: finalCombinedAudioPath, //  Return the actual file system path for now, or adjust to be web-accessible
    notes: resolvedArticleNotes.map((notes) => notes.notes),
    feedItems: feedItemsToProcess,
  };

  // Save the podcast metadata
  logger.info(`Saving podcast metadata`);
  await fs.promises.writeFile(metadataPath, JSON.stringify(result, null, 2));
  logger.info(`Podcast generation completed successfully`);

  return result;
}

export async function getDirectPodcastAudio(
  rssFeedUrl: string,
  forceRegenerate: boolean = false
): Promise<DirectPodcastResult | null> {
  logger.info(`Fetching direct podcast audio from RSS feed: ${rssFeedUrl}`);

  // Check if transcription already exists for today
  const feedId = rssFeedUrl.replace(/[^a-zA-Z0-9]/g, "_");
  const today = getLocalDateString();
  const podcastsDir = path.join(process.cwd(), "podcasts");
  const feedSpecificDir = path.join(podcastsDir, feedId, today);
  const transcriptionPath = path.join(feedSpecificDir, "direct_podcast.json");

  // Create directories if they don't exist
  if (!fs.existsSync(feedSpecificDir)) {
    fs.mkdirSync(feedSpecificDir, { recursive: true });
  }

  // Check if today's transcription already exists
  if (fs.existsSync(transcriptionPath) && !forceRegenerate) {
    logger.info(
      `Found existing transcription for feed ${rssFeedUrl} on ${today}, returning cached result`
    );
    const existingResult = JSON.parse(
      fs.readFileSync(transcriptionPath, "utf-8")
    );
    return existingResult;
  }

  if (forceRegenerate && fs.existsSync(transcriptionPath)) {
    logger.info(
      `Force regenerate flag set. Overwriting existing transcription for feed ${rssFeedUrl} on ${today}.`
    );
  }

  // Fetch RSS feed and get the latest podcast episode
  const allFeedItems = await fetchAndParseRSS(rssFeedUrl);
  const latestPodcastEpisode = allFeedItems.find(
    (item) => item.contentType === "audio"
  );

  if (!latestPodcastEpisode || !latestPodcastEpisode.audioUrl) {
    logger.warn(`No audio episodes found in RSS feed ${rssFeedUrl}`);
    return null;
  }

  logger.info(
    `Found latest podcast episode: "${latestPodcastEpisode.title}" from ${latestPodcastEpisode.audioUrl}`
  );

  // Transcribe the audio using Whisper
  const transcribedText = await transcribeAudioFromUrl(
    latestPodcastEpisode.audioUrl
  );

  if (transcribedText === null || transcribedText.trim() === "") {
    logger.error(
      `Transcription failed or empty for episode "${latestPodcastEpisode.title}" from ${latestPodcastEpisode.audioUrl}`
    );
    return null;
  }

  logger.info(
    `Successfully transcribed podcast episode. Length: ${transcribedText.length} chars.`
  );

  // Generate notes from the transcription
  const pseudoArticleData: ArticleData = {
    title: latestPodcastEpisode.title || "Untitled Podcast Episode",
    content: transcribedText,
    url: latestPodcastEpisode.audioUrl,
    published: latestPodcastEpisode.pubDate,
    source: rssFeedUrl,
  };

  const notes = await generatePodcastNotes(pseudoArticleData);

  const result: DirectPodcastResult = {
    title: latestPodcastEpisode.title || "Untitled Podcast Episode",
    audioUrl: latestPodcastEpisode.audioUrl,
    transcription: transcribedText,
    pubDate: latestPodcastEpisode.pubDate,
    notes,
    feedItem: latestPodcastEpisode,
  };

  // Save the result
  await fs.promises.writeFile(
    transcriptionPath,
    JSON.stringify(result, null, 2)
  );
  logger.info(`Direct podcast processing completed successfully`);

  return result;
}

export async function getDirectPodcastForPlayback(
  rssFeedUrl: string,
  forceRegenerate: boolean = false
): Promise<DirectPodcastPlayback | null> {
  logger.info(
    `Fetching direct podcast for playback from RSS feed: ${rssFeedUrl}`
  );

  // Check if podcast info already exists for today
  const feedId = rssFeedUrl.replace(/[^a-zA-Z0-9]/g, "_");
  const today = getLocalDateString();
  const podcastsDir = path.join(process.cwd(), "podcasts");
  const feedSpecificDir = path.join(podcastsDir, feedId, today);
  const playbackInfoPath = path.join(feedSpecificDir, "direct_playback.json");

  // Create directories if they don't exist
  if (!fs.existsSync(feedSpecificDir)) {
    fs.mkdirSync(feedSpecificDir, { recursive: true });
  }

  // Check if today's info already exists
  if (fs.existsSync(playbackInfoPath) && !forceRegenerate) {
    logger.info(
      `Found existing playback info for feed ${rssFeedUrl} on ${today}, returning cached result`
    );
    const existingResult = JSON.parse(
      fs.readFileSync(playbackInfoPath, "utf-8")
    );
    return existingResult;
  }

  if (forceRegenerate && fs.existsSync(playbackInfoPath)) {
    logger.info(
      `Force regenerate flag set. Overwriting existing playback info for feed ${rssFeedUrl} on ${today}.`
    );
  }

  // Fetch RSS feed and get the latest podcast episode
  const allFeedItems = await fetchAndParseRSS(rssFeedUrl);
  const latestPodcastEpisode = allFeedItems.find(
    (item) => item.contentType === "audio"
  );

  if (!latestPodcastEpisode || !latestPodcastEpisode.audioUrl) {
    logger.warn(`No audio episodes found in RSS feed ${rssFeedUrl}`);
    return null;
  }

  logger.info(
    `Found latest podcast episode for direct playback: "${latestPodcastEpisode.title}" from ${latestPodcastEpisode.audioUrl}`
  );

  // Get feed-level information for fallback images
  const feedInfo = await fetchRSSFeedInfo(rssFeedUrl);

  // Determine the best image to use (episode image > feed image > favicon)
  let imageUrl =
    latestPodcastEpisode.imageUrl || latestPodcastEpisode.thumbnailUrl;
  if (!imageUrl) {
    imageUrl = feedInfo.imageUrl;
  }

  // Generate favicon URL from feed link or RSS URL
  const faviconUrl = getFaviconUrl(feedInfo.link || rssFeedUrl);

  // Create feed items array with feed-level image information
  const feedItems = allFeedItems.slice(0, 5).map((item) => ({
    title: item.title || "Untitled Episode",
    link: item.link,
    content: item.content,
    pubDate: item.pubDate,
    audioUrl: item.audioUrl,
    contentType: item.contentType,
    imageUrl: item.imageUrl || item.thumbnailUrl || feedInfo.imageUrl, // Use feed image as fallback
    thumbnailUrl: item.thumbnailUrl,
    enclosure: item.enclosure,
    itunes: item.itunes,
  }));

  const result: DirectPodcastPlayback = {
    title: latestPodcastEpisode.title || "Untitled Podcast Episode",
    audioUrl: latestPodcastEpisode.audioUrl,
    pubDate: latestPodcastEpisode.pubDate,
    description: latestPodcastEpisode.content,
    feedItem: latestPodcastEpisode,
    imageUrl,
    faviconUrl,
    feedInfo: {
      title: feedInfo.title,
      imageUrl: feedInfo.imageUrl,
      link: feedInfo.link,
      itunes: feedInfo.itunes,
    },
    feedItems,
  };

  // Save the result
  await fs.promises.writeFile(
    playbackInfoPath,
    JSON.stringify(result, null, 2)
  );
  logger.info(`Direct podcast playback info saved successfully`);

  return result;
}
