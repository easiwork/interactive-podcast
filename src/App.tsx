import { useEffect, useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getEphemeralKey } from "./ai-utils";
import { HackerNewsSummary } from "@/components/HackerNewsSummary";
import MicButton from "./components/MicButton";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const AudioTranscriptPlayer = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const previousTimeRef = useRef(0);

  return (
    <Card className="w-[90vw] mx-auto mt-8">
      <CardContent className="p-6">
        <div className="mt-6">
          <HackerNewsSummary />
        </div>
      </CardContent>
    </Card>
  );
};

export default AudioTranscriptPlayer;
