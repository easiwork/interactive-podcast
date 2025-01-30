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
}

const MicButton = ({ onListen, onMute }: MicButtonProps) => {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("");

  const { startSession, stopSession } = useRealtimeSession();

  const toggleListening = async () => {
    if (!isListening) {
      onListen();

      setIsListening(true);
      setStatus("Starting session...");
      await startSession();
      setStatus("Session started");
    } else {
      setIsListening(false);
      stopSession();
      setStatus("Session stopped");

      onMute();
    }
  };

  return (
    <div className="space-y-4">
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
  );
};

export default MicButton;
