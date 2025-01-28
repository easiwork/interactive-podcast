import { useEffect, useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getEphemeralKey } from "./ai-utils";
import { HackerNewsSummary } from "@/components/HackerNewsSummary";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const AudioTranscriptPlayer = () => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);

  async function startSession() {
    // Get an ephemeral key from the Fastify server
    const EPHEMERAL_KEY = await getEphemeralKey();

    // Create a peer connection
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => (audioElement.current!.srcObject = e.streams[0]);

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    pc.addTrack(ms.getTracks()[0]);

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    } satisfies RTCSessionDescriptionInit;
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  // Send a message to the model
  function sendClientEvent(message: any) {
    if (dataChannel) {
      message.event_id = message.event_id || crypto.randomUUID();
      dataChannel.send(JSON.stringify(message));
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        "Failed to send message - no data channel available",
        message
      );
    }
  }

  // Send a text message to the model
  function sendTextMessage(message: string) {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener("message", (e) => {
        setEvents((prev) => [JSON.parse(e.data), ...prev]);
      });
      const timestamp = `${previousTimeRef.current / 60}m ${previousTimeRef.current % 60}s`;
      // Set session active when the data channel is opened
      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setEvents([]);
      });
    }
  }, [dataChannel]);

  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const previousTimeRef = useRef(0);

  const toggleListening = async () => {
    if (!isListening) {
      // Store current time and pause audio
      if (audioRef.current) {
        previousTimeRef.current = audioRef.current.currentTime;
        audioRef.current.pause();
      }

      setIsListening(true);
      setStatus("Starting session...");
      await startSession();
      setStatus("Session started");
    } else {
      setIsListening(false);
      stopSession();
      setStatus("Session stopped");
      setStatus("");
      // Resume playback when canceling listening
      if (audioRef.current) {
        audioRef.current.play();
      }
    }
  };

  return (
    <Card className="w-[90vw] mx-auto mt-8">
      <CardContent className="p-6">
        <div className="space-y-4">
          <audio
            ref={audioRef}
            src="test2.mp3"
            className="w-full mb-4"
            controls
          />

          <div className="flex justify-center">
            <Button
              onClick={toggleListening}
              className={`w-12 h-12 rounded-full ${isListening ? "bg-red-500 hover:bg-red-600" : ""}`}
            >
              {isListening ? (
                <MicOff className="w-6 h-6" />
              ) : (
                <Mic className="w-6 h-6" />
              )}
            </Button>
          </div>

          {status && (
            <Alert>
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          )}
        </div>
        <div className="mt-6">
          <HackerNewsSummary />
        </div>
      </CardContent>
    </Card>
  );
};

export default AudioTranscriptPlayer;
