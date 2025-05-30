import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import OpenAI from 'openai';
import fetch from 'node-fetch'; // ESModule import
import { v4 as uuidv4 } from 'uuid'; // For unique temporary filenames

// Ensure OPENAI_API_KEY is loaded, or configure elsewhere
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple logger (can be replaced with the one from podcast-generator if this file grows)
const logger = {
  info: (message: string) => console.log(`[Audio Utils] ${message}`),
  error: (message: string, error?: any) => console.error(`[Audio Utils] ${message}`, error || ''),
  warn: (message: string) => console.warn(`[Audio Utils] ${message}`),
};

export async function transcribeAudioFromUrl(audioUrl: string): Promise<string | null> {
  logger.info(`Starting transcription for audio URL: ${audioUrl}`);
  let tempFilePath: string | null = null;

  try {
    // 1. Download the audio file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio file: ${response.statusText} from ${audioUrl}`);
    }
    if (!response.body) {
        throw new Error(`Response body is null for ${audioUrl}`);
    }

    const contentType = response.headers.get('content-type');
    // Determine a safe extension, default to .mp3 if unknown, as Whisper supports many formats.
    const extension = contentType?.includes('mpeg') ? '.mp3' : 
                      contentType?.includes('wav') ? '.wav' :
                      contentType?.includes('aac') ? '.aac' :
                      contentType?.includes('ogg') ? '.ogg' :
                      contentType?.includes('flac') ? '.flac' :
                      '.mp3'; // Default or common format

    tempFilePath = path.join(os.tmpdir(), `${uuidv4()}${extension}`);
    logger.info(`Downloading audio to temporary file: ${tempFilePath}`);

    // Stream the response body to a file
    const fileStream = fs.createWriteStream(tempFilePath);
    await new Promise((resolve, reject) => {
        response.body!.pipe(fileStream);
        response.body!.on("error", reject);
        fileStream.on("finish", resolve);
    });
    
    // Check file size before sending to Whisper
    const stats = await fs.promises.stat(tempFilePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    logger.info(`Audio file downloaded successfully. Size: ${fileSizeMB.toFixed(2)} MB`);
    
    // Whisper has a 25MB limit
    if (fileSizeMB > 25) {
      logger.warn(`Audio file is too large for Whisper (${fileSizeMB.toFixed(2)} MB > 25 MB limit). Skipping transcription.`);
      return null;
    }

    // 2. Transcribe the local audio file using OpenAI Whisper
    logger.info(`Sending ${tempFilePath} to OpenAI Whisper for transcription...`);
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1', // Or other Whisper models
      file: fs.createReadStream(tempFilePath),
      // language: 'en', // Optional: specify language
      // response_format: 'text' // Get plain text
    });

    logger.info(`Transcription successful for ${audioUrl}`);
    // The API returns an object, the text is in transcription.text if using older SDK versions or just transcription if it's a string
    const transcribedText = typeof transcription === 'string' ? transcription : (transcription as any).text;
    
    if (!transcribedText || transcribedText.trim() === "") {
        logger.warn(`Transcription for ${audioUrl} resulted in empty text.`);
        return ""; // Return empty string for empty transcription
    }

    return transcribedText;

  } catch (error: any) {
    // Handle specific Whisper API errors
    if (error.response && error.response.status === 413) {
      logger.warn(`Whisper API rejected file as too large (413 error) for ${audioUrl}. This is expected for long podcast episodes.`);
      return null;
    }
    
    if (error.response && error.response.status === 400) {
      logger.warn(`Whisper API rejected file format or content (400 error) for ${audioUrl}: ${error.message}`);
      return null;
    }
    
    logger.error(`Error during audio transcription for ${audioUrl}: ${error.message}`, error);
    return null; // Return null to indicate failure
  } finally {
    // 4. Clean up the temporary audio file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.promises.unlink(tempFilePath);
        logger.info(`Temporary file ${tempFilePath} deleted.`);
      } catch (cleanupError) {
        logger.error(`Failed to delete temporary file ${tempFilePath}`, cleanupError);
      }
    }
  }
}

// Example Usage (for testing this file directly)
/*
async function testTranscription() {
  // Replace with a direct link to a short audio file for testing
  const testAudioUrl = 'https://cdn.simplecast.com/audio/a59569/a5956995-4169-4950-bd71-3107ca515669/3c6b3e9f-e470-4034-96ce-3315a7e9913c/darknet-diaries-ep-1-segment-1_tc.mp3'; // Short segment example
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY environment variable is not set.");
    return;
  }
  const transcription = await transcribeAudioFromUrl(testAudioUrl);
  if (transcription !== null) {
    console.log("\\nTranscription Result:\\n", transcription);
  } else {
    console.log("\\nTranscription failed.");
  }
}

// To run test: OPENAI_API_KEY=your_key bun run src/server/audio-utils.ts (if you add a shebang or call testTranscription)
// or import and call from another file.
// Make sure to install uuid: bun add uuid @types/uuid
// testTranscription();
*/ 