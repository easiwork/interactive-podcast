import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { generatePodcastScript } from "@/ai-utils";
import { extract } from "@extractus/article-extractor";
import { TextToSpeechRequest, VoiceOption } from "@/server/server";

const MOCK_SCRIPT =
  "<Host 1>: Welcome back to TechTalk, the podcast where we dive deep into the latest in tech innovations and cybersecurity. I'm Sarah, and with me as always is Mike. Today, we've got a spicy topic, don't we, Mike?\n\n<Host 2>: Oh, absolutely, Sarah. It's all about a couple of cybersecurity exploits called SLAP and FLOP, which were found to affect Apple devices. These exploits are groundbreaking in their approach to leaking sensitive information.\n\n<Host 1>: Right, the researchers behind this discovery trained the M3 CPU's Load Value Predictor, or LVP, using sandboxed JavaScript code running inside WebKit - that's Safari's browsing engine. The scary part is when the mouse cursor hovers over their demo webpage, it can potentially leak Proton Mail's inbox data, including sender and subject lines.\n\n<Host 2>: And it doesn't stop there. They also demonstrated a proof-of-concept on the Apple M2 CPU that recovers a secret string - the first paragraph of \"The Great Gatsby,\" to be precise - without ever architecturally accessing the string.\n\n<Host 1>: The technique also works with the Harry Potter series on the M3 CPU, showing just how versatile these attacks, SLAP and FLOP, can be. It’s an alarming example of how sophisticated cyber attacks are becoming, especially with how they leverage the inner workings of current CPUs.\n\n<Host 2>: The brains behind these discoveries are a group of researchers from Georgia Institute of Technology and Ruhr University Bochum, including Jason Kim, Jalen Chuang, Daniel Genkin, and Yuval Yarom. Their work delves deep into the microarchitecture of CPUs to pull off these exploits.\n\n<Host 1>: And according to their findings, these exploits can affect a wide range of Apple devices, like all Mac laptops from 2022 to the present, all Mac desktops from 2023, and several models of iPads and iPhones.\n\n<Host 2>: They highlight a critical point: while hardware and software measures exist to keep webpages isolated from each other, SLAP and FLOP can break these protections, allowing attacker pages to read sensitive data from target pages. This could range from location history to credit card information.\n\n<Host 1>: But it's not all doom and gloom. Apple has been notified about these vulnerabilities, and they're planning to address them in an upcoming security update. It underscores the importance of keeping your devices up to date, folks.\n\n<Host 2>: Absolutely, Sarah. And for our tech-savvy listeners, this research is a fascinating deep dive into side-channel attacks and speculative execution vulnerabilities, akin to the infamous Spectre exploit but with a twist, as SLAP and FLOP focus on data flow predictions.\n\n<Host 1>: To wrap up, while this might sound like something out of a cybersecurity thriller, it's a real-world issue that affects possibly millions of devices. It stresses the need for continual vigilance in the world of cybersecurity, both for the companies making our devices and the users themselves.\n\n<Host 2>: Couldn't have said it better myself, Sarah. That’s all for today’s episode. Stay safe, stay updated, and we’ll catch you in the next discussion on TechTalk.\n\n<Host 1>: Until next time, keep your digital lives secure and your physical ones adventurous. Goodbye, everyone!";

interface Article {
  title: string;
  url: string;
}

const mapToVoice = (host: string): VoiceOption => {
  if (host === "Host 1") {
    return "Rachel";
  }

  return "Julian";
};

const fetchAudio = async (line: string) => {
  const [host, text] = line.split(": ");
  const voice = mapToVoice(host.slice(1, -1));

  return fetch(TEXT_TO_SPEECH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, voice } satisfies TextToSpeechRequest),
  });
};

const generateAudioUrl = async (line: string): Promise<string> => {
  const audioResponse = await fetchAudio(line);

  const audioBlob = await audioResponse.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  return audioUrl;
};

const generateAndCombineAudio = async (
  script: string[],
  audioContext: AudioContext
) => {
  const audioBuffers = [];

  // Load and decode each MP3 file
  for (const line of script) {
    const response = await fetchAudio(line);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    audioBuffers.push(audioBuffer);
  }

  // Determine total length
  const totalDuration = audioBuffers.reduce(
    (sum, buffer) => sum + buffer.duration,
    0
  );
  const sampleRate = audioContext.sampleRate;
  const numChannels = audioBuffers[0].numberOfChannels;
  const totalLength = Math.ceil(totalDuration * sampleRate);

  // Create a new AudioBuffer to store merged audio
  const mergedBuffer = audioContext.createBuffer(
    numChannels,
    totalLength,
    sampleRate
  );

  // Copy audio data into the new buffer
  let offset = 0;
  for (const buffer of audioBuffers) {
    for (let channel = 0; channel < numChannels; channel++) {
      mergedBuffer
        .getChannelData(channel)
        .set(buffer.getChannelData(channel), offset);
    }
    offset += Math.ceil(buffer.duration * sampleRate); // Fix: Use actual number of samples
  }

  return mergedBuffer;
};

const EXTRACT_ARTICLE_URL = "http://localhost:3000/api/extract-article";
const TEXT_TO_SPEECH_URL = "http://localhost:3000/api/text-to-speech";

export function HackerNewsSummary() {
  const [article, setArticle] = useState<Article | null>(null);
  const [rawScript, setRawScript] = useState<string>("");
  const [script, setScript] = useState<string[] | undefined>();
  const [currentScriptIndex, setCurrentScriptIndex] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [isPlaying, setIsPlaying] = useState(false);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    fetchTopStoryAndGenScript();
  }, []);

  const fetchTopStoryAndGenScript = async () => {
    try {
      // Get top stories from HN
      const topStoriesResponse = await fetch(
        "https://hacker-news.firebaseio.com/v0/topstories.json"
      );
      const topStories = await topStoriesResponse.json();

      // Get details of first story
      const firstStoryResponse = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${topStories[0]}.json`
      );
      const story = await firstStoryResponse.json();
      console.log("story", story.url);

      setArticle({
        title: story.title,
        url: story.url,
      });

      const articleDataResponse = await fetch(EXTRACT_ARTICLE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: story.url }),
      });
      const articleData = await articleDataResponse.json();
      if (!articleData) {
        console.error("Failed to extract article");
        return;
      }

      console.log("articleData", articleData);

      // Generate podcast script with GPT
      // const rawScript = await generatePodcastScript(articleData);

      // temporary mock script
      const rawScript = MOCK_SCRIPT;

      setRawScript(rawScript);
      setScript(rawScript.split(/[\n\r]+/));
    } catch (err) {
      setError("Failed to fetch article");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const audioContextRef = useRef<AudioContext>(new AudioContext());
  useEffect(() => {
    if (!script) {
      return;
    }

    generateAndCombineAudio(script, audioContextRef.current).then((b) => {
      audioBufferRef.current = b;
      playAudio();
    });

    // Cleanup function
    return () => {
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
        currentSourceRef.current = null;
      }
    };
  }, [script, currentScriptIndex, currentSourceRef]);

  const playAudio = () => {
    if (!audioBufferRef.current || isPlaying) return;

    // Clean up previous source if it exists
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current.disconnect();
      currentSourceRef.current = null;
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      setIsPlaying(false);
      // Clean up after playback ends
      source.disconnect();
      currentSourceRef.current = null;
    };
    console.log("playing audio");
    source.start();
    setIsPlaying(true);

    currentSourceRef.current = source;
  };

  if (loading) {
    return (
      <Alert>
        <AlertDescription>Loading article...</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          <a
            href={article?.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {article?.title}
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {script?.map((line, index) => (
            <span key={index}>
              {line}
              <br />
            </span>
          ))}
        </p>
      </CardContent>
      <CardFooter>
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            className="w-full mb-4"
            onEnded={() => setCurrentScriptIndex(currentScriptIndex + 1)}
            autoPlay
          />
        )}
      </CardFooter>
    </Card>
  );
}
