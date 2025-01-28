import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { ElevenLabsClient } from "elevenlabs";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/__vite_dev_proxy__": {
        changeOrigin: true,
        configure(_, options) {
          options.rewrite = (path) => {
            const proxyUrl = new URL(path, "file:"),
              url = new URL(proxyUrl.searchParams.get("url")!);

            // Since JS is single threaded, so it won't cause problem
            options.target = url.origin;
            return url.pathname + url.search;
          };
        },
      },
      // "/api/text-to-speech": {
      //   selfHandleResponse: true,
      //   configure(proxy, _options) {
      //     proxy.on("proxyRes", async (_proxyRes, req, res) => {
      //       try {
      //         let body = "";
      //         req.on("data", (chunk) => {
      //           body += chunk;
      //         });
      //         req.on("end", async () => {
      //           const text = body;
      //           const audioBuffer = await createAudioStreamFromText(text);
      //           res.writeHead(200, {
      //             "Content-Type": "audio/mpeg",
      //             "Content-Length": audioBuffer.length,
      //           });
      //           res.end(audioBuffer);
      //         });
      //       } catch (error) {
      //         console.error("Text-to-speech error:", error);
      //         res.writeHead(500);
      //         res.end("Internal Server Error");
      //       }
      //     });
      //   },
      // },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
