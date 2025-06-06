import { useEffect, useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HackerNewsSummary } from "@/components/HackerNewsSummary";
import { useRealtimeSession } from "./useRealtimeSession";

interface MicButtonProps {
  onListen: () => void;
  onMute: () => void;
  script?: string;
}

const MicButton = ({ onListen, onMute, script }: MicButtonProps) => {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("");
  const isStartingSession = useRef(false);

  const { startSession, stopSession, sendTextMessage, isSessionActive } =
    useRealtimeSession();

  const toggleListening = async () => {
    // Prevent multiple simultaneous session starts
    if (isStartingSession.current) {
      return;
    }

    if (!isListening) {
      try {
        isStartingSession.current = true;
        onListen();
        setIsListening(true);
        setStatus("Starting session...");
        await startSession();
        setStatus("Session started");
      } catch (error) {
        console.error("Failed to start session:", error);
        setIsListening(false);
        setStatus("Failed to start session");
        onMute();
      } finally {
        isStartingSession.current = false;
      }
    } else {
      setIsListening(false);
      stopSession();
      setStatus("Session stopped");
      onMute();
    }
  };

  // Cleanup effect to ensure session is stopped when component unmounts
  useEffect(() => {
    return () => {
      if (isSessionActive) {
        stopSession();
      }
    };
  }, [isSessionActive]);

  // Sync local state with session state
  useEffect(() => {
    if (!isSessionActive && isListening) {
      setIsListening(false);
      setStatus("Session stopped");
      onMute();
    }
  }, [isSessionActive]);

  useEffect(() => {
    if (isSessionActive) {
      sendTextMessage(
        `The user has paused the podcast to ask a question. Wait for the user to finish speaking before saying anything about the podcast. Here is the script up to the point where the user paused:\n${script}`
      );
    }
  }, [isSessionActive, script]);

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Button
          onClick={toggleListening}
          className={`w-12 h-12 rounded-full ${isListening ? "bg-red-500 hover:bg-red-600" : ""}`}
          disabled={isStartingSession.current}
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
  );
};

export default MicButton;
