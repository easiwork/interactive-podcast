import express from "express";
import cors from "cors";
import { ElevenLabsClient } from "elevenlabs";
import path from "node:path";
import fs from "node:fs";
import { ArticleData, extract } from "@extractus/article-extractor";

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
const router = express.Router();

// Middleware
app.use(express.json());
app.use(cors());

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

export async function generatePodcastScript(
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
You are a helpful assistant that provides podcast scripts for text articles. The script should
only contain lines of dialogue exchanged between the two hosts. Do not mention the podcast name
or include a sign off at the end. The script should just be a conversation between the two hosts
about the article. The script should be in the following format:

Host 1: <line_of_dialogue>
Host 2: <line_of_dialogue>
Host 1: <line_of_dialogue>
Host 2: <line_of_dialogue>
`,
        },
        {
          role: "user",
          content: `
You will be provided with an article from a website. The article will be provided as a JSON structure.

Here is the JSON data as follows:
${JSON.stringify(articleData)}`,
        },
      ],
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

// Extract article from HTML endpoint
router.post("/generate-podcast-script", async (req, res) => {
  let articleData: ArticleData | null = null;
  try {
    const { url } = req.body as { url: string };
    articleData = await extract(url);

    if (!articleData) {
      throw Error("No article data");
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to extract article" });
    return;
  }

  // Generate podcast script with GPT
  const script = await generatePodcastScript(articleData);

  res.setHeader("Content-Type", "application/json");
  res.status(200).json({ script });
});

// Text-to-speech endpoint
router.post("/text-to-speech", async (req, res) => {
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
    console.error(err);
  }
});

router.get("/healthcheck", (req, res) => {
  res.status(200).send("OK");
});

if (process.env.NODE_ENV !== "development") {
  app.use("/", router);
} else {
  app.use("/api", router);
}

// Handle 404 for unknown routes
app.use((req, res) => {
  res.status(404).send("Not Found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
