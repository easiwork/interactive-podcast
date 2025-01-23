import { ArticleData } from "@extractus/article-extractor";
import transcript from "./transcript";
import { ElevenLabsClient } from "elevenlabs";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const prompt = `you're analyzing a podcast transcript. the user paused the podcast at a specific timestamp and has some questions about what was said so far. your job is to reply with precise, on-topic answers. don't mention the show's name, the time paused, or any random filler. just respond directly to whatever the user wants to know from the transcript.
if the user asks something like “what's the main argument,” give a concise statement of that argument. if they say “who's speaking,” just say who it is. no disclaimers, no fluff. if there's not enough info, be honest and say you don't know. otherwise, keep it short and straightforward
example Q&A style:
user: “did they talk about climate change or was it just politics?”
assistant: “they spent most of the time on climate change and only briefly mentioned a few political updates.”
user: “who's the sponsor for the show?”
assistant: “it's sponsored by XYZ solutions.”
that's it. remember—only relevant details from the transcript.
Here is the transcript:
${transcript}
`;

export async function getEphemeralKey() {
  const tokenResponse = await fetch(
    "https://api.openai.com/v1/realtime/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
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
  return data.client_secret.value;
}

export async function summarizeArticle(
  articleData: ArticleData
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that provides podcast scripts for text articles.",
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

const client = new ElevenLabsClient({
  apiKey: import.meta.env.VITE_ELEVENLABS_API_KEY,
});

export const createAudioStreamFromText = async (
  text: string
): Promise<Buffer> => {
  const audioStream = await client.generate({
    voice: "Rachel",
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
