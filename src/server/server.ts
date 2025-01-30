import express from "express";
import cors from "cors";
import { ElevenLabsClient } from "elevenlabs";
import path from "node:path";
import fs from "node:fs";
import { extract } from "@extractus/article-extractor";

// import { TextToSpeechClient } from "@google-cloud/text-to-speech";
// import { GoogleAuth } from "google-auth-library";

// const auth = new GoogleAuth({
//   keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
//   scopes: ["https://www.googleapis.com/auth/cloud-platform"],
// });

// const textToSpeechClient = new TextToSpeechClient({ auth });

// export const createGoogleAudioFromText = async (
//   text: string
// ): Promise<Buffer> => {
//   const request = {
//     input: { text },
//     voice: {
//       languageCode: "en-US",
//       name: "en-US-Neural2-F",
//     },
//     audioConfig: {
//       audioEncoding: "MP3",
//       speakingRate: 1.0,
//       pitch: 0.0,
//     },
//   } as any;

//   const [response] = await textToSpeechClient.synthesizeSpeech(request);
//   return Buffer.from(response.audioContent as any);
// };

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

// Middleware
app.use(express.json());
app.use(cors());

export type VoiceOption = "Rachel" | "Julian";

export interface TextToSpeechRequest {
  text: string;
  voice: VoiceOption;
}

const ENABLE_TEST = true;

// Extract article from HTML endpoint
app.post("/api/extract-article", async (req, res) => {
  const { url } = req.body as { url: string };
  const articleData = await extract(url);
  res.setHeader("Content-Type", "application/json");
  res.status(200).json(articleData);
});

// Text-to-speech endpoint
app.post("/api/text-to-speech", async (req, res) => {
  try {
    const { text, voice } = req.body as TextToSpeechRequest;

    if (ENABLE_TEST) {
      let audioPath = "";
      if (voice === "Rachel") {
        audioPath = path.join(process.cwd(), "public", "rachel.mp3");
      } else {
        audioPath = path.join(process.cwd(), "public", "daniel.mp3");
      }

      const testAudioBuffer = await fs.promises.readFile(audioPath);
      res.setHeader("Content-Type", "audio/mpeg");
      res.status(200).send(testAudioBuffer);
    } else {
      const audioBuffer = await createAudioStreamFromText(text, voice);

      res.setHeader("Content-Type", "audio/mpeg");
      res.status(200).send(audioBuffer);
    }
  } catch (err) {
    res.status(400).send("Invalid request body");
  }
});

// Handle 404 for unknown routes
app.use((req, res) => {
  res.status(404).send("Not Found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
