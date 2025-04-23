import { ArticleData } from "@extractus/article-extractor";
import transcript from "./transcript";
import { realtimePrompt } from "./realtime-prompt";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

export const getHost = () => {
  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }

  return "api";
};

const EPHEMERAL_KEY_URL = `${getHost()}/get-ephemeral-key`;

export async function getEphemeralKey() {
  const tokenResponse = await fetch(EPHEMERAL_KEY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: realtimePrompt }),
  });

  const data = await tokenResponse.json();
  return data.client_secret.value;
}

export async function generatePodcastScript(
  articleData: ArticleData
): Promise<string> {
  const key = await getEphemeralKey();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
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

<Host 1>: <line_of_dialogue>
<Host 2>: <line_of_dialogue>
<Host 1>: <line_of_dialogue>
<Host 2>: <line_of_dialogue>
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
