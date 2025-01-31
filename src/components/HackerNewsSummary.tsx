import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextToSpeechRequest, VoiceOption } from "@/server/server";
import { Button } from "./ui/button";
import MicButton from "./MicButton";
import { Story } from "./hacker-news-api";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./ui/collapsible";

const mapToVoice = (host: string): VoiceOption => {
  if (host === "Host 1") {
    return "Rachel";
  }

  return "Daniel";
};

const fetchAudio = async (line: string) => {
  const [host, text] = line.split(": ");
  const voice = mapToVoice(host);

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

const GENERATE_PODCAST_SCRIPT_URL =
  "http://localhost:3000/api/generate-podcast-script";
const TEXT_TO_SPEECH_URL = "http://localhost:3000/api/text-to-speech";

interface HackerNewsSummaryProps {
  story: Story;
}

export function HackerNewsSummary({ story }: HackerNewsSummaryProps) {
  const [scriptLines, setScriptLines] = useState<string[] | undefined>();
  const [scriptAudioUrls, setScriptAudioUrls] = useState<
    string[] | undefined
  >();
  const [currentScriptIndex, setCurrentScriptIndex] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    generateScript();
  }, []);

  const generateScript = async () => {
    try {
      const podcastScriptResponse = await fetch(GENERATE_PODCAST_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: story.url }),
      });
      const { script } = (await podcastScriptResponse.json()) as {
        script: string;
      };

      setScriptLines(script.split(/[\n\r]+/));
    } catch (err) {
      setError("Failed to fetch article");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!scriptLines) {
      return;
    }

    Promise.all(scriptLines.map(generateAudioUrl)).then(setScriptAudioUrls);
  }, [scriptLines]);

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
    <>
      <Collapsible>
        <CollapsibleTrigger>Transcript</CollapsibleTrigger>
        <CollapsibleContent>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {scriptLines?.map((line, index) => (
              <span key={index}>
                {line}
                <br />
              </span>
            ))}
          </p>
        </CollapsibleContent>
      </Collapsible>

      {scriptAudioUrls && (
        <audio
          ref={audioRef}
          src={scriptAudioUrls[currentScriptIndex]}
          className="w-full mb-4"
          onEnded={() => setCurrentScriptIndex(currentScriptIndex + 1)}
          autoPlay
        />
      )}

      {scriptAudioUrls && (
        <>
          <MicButton
            onListen={() => {
              audioRef.current?.pause();
              setIsPlaying(false);
            }}
            onMute={() => {
              audioRef.current?.play();
              setIsPlaying(true);
            }}
            script={scriptLines?.slice(0, currentScriptIndex).join("\n")}
          />
          <Button
            onClick={() => {
              if (isPlaying) {
                audioRef.current?.pause();
                setIsPlaying(false);
              } else {
                audioRef.current?.play();
                setIsPlaying(true);
              }
            }}
          >
            {isPlaying ? "Pause" : "Play"}
          </Button>
        </>
      )}
    </>
  );
}
