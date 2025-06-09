import { useEffect, useState, useRef } from "react";
import { getEphemeralKey } from "../ai-utils";

export const useRealtimeSession = () => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);

  async function startSession() {
    console.log("Starting session...");
    // Get an ephemeral key from the Fastify server
    const EPHEMERAL_KEY = await getEphemeralKey();
    console.log("Got ephemeral key");

    // Create a peer connection
    const pc = new RTCPeerConnection();
    console.log("Created peer connection");

    // Set up to play remote audio from the model
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => {
      console.log("Received track from model");
      audioElement.current!.srcObject = e.streams[0];
    };

    let hasNoMicrophone = false;
    try {
      // Try to get microphone access
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      console.log("Got microphone access");
      microphoneStream.current = ms;
      pc.addTrack(ms.getTracks()[0]);
    } catch (error) {
      console.log("No microphone available, using dummy audio track");
      hasNoMicrophone = true;
      // Create a dummy audio track if no microphone is available
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      pc.addTrack(destination.stream.getAudioTracks()[0]);
    }

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    console.log("Created data channel");
    setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    console.log("Created offer");
    await pc.setLocalDescription(offer);
    console.log("Set local description");

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
    console.log("Got SDP response");

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    } satisfies RTCSessionDescriptionInit;
    await pc.setRemoteDescription(answer);
    console.log("Set remote description");

    peerConnection.current = pc;

    // Add event listeners to the data channel
    dc.addEventListener("open", () => {
      console.log("Data channel opened");
      setIsSessionActive(true);
      setEvents([]);
    });

    dc.addEventListener("message", (e) => {
      console.log("Received message:", e.data);
      const data = JSON.parse(e.data);
      setEvents((prev) => [data, ...prev]);

      // If we receive a response.created event, that means the connection is stable
      if (data.type === "response.created" && hasNoMicrophone) {
        console.log("Connection stable, sending dummy prompt");
        const event = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "What did they just talk about?",
              },
            ],
          },
        };
        sendClientEvent(event);
        sendClientEvent({ type: "response.create" });
      }
    });

    dc.addEventListener("close", () => {
      console.log("Data channel closed");
      setIsSessionActive(false);
    });

    dc.addEventListener("error", (error) => {
      console.error("Data channel error:", error);
    });

    pc.addEventListener("connectionstatechange", () => {
      console.log("Connection state changed:", pc.connectionState);
    });

    pc.addEventListener("iceconnectionstatechange", () => {
      console.log("ICE connection state changed:", pc.iceConnectionState);
    });
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    console.log("Stopping session...");

    // Stop microphone stream first
    if (microphoneStream.current) {
      console.log("Stopping microphone stream");
      microphoneStream.current.getTracks().forEach((track) => {
        track.stop();
        console.log("Stopped microphone track:", track.label);
      });
      microphoneStream.current = null;
    }

    if (dataChannel) {
      console.log("Closing data channel");
      dataChannel.close();
    }
    if (peerConnection.current) {
      console.log("Closing peer connection");
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    console.log("Session stopped");
  }

  // Generate a UUID-like string as fallback for crypto.randomUUID
  function generateUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback implementation for environments without crypto.randomUUID
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  // Send a message to the model
  function sendClientEvent(message: any) {
    if (dataChannel) {
      message.event_id = message.event_id || generateUUID();
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

  function updateSession(
    sessionProps: {
      instructions?: string;
    } & Record<string, any>
  ) {
    const event = {
      type: "session.update",
      session: sessionProps,
    };

    sendClientEvent(event);
  }

  return {
    isSessionActive,
    startSession,
    stopSession,
    updateSession,
    sendTextMessage,
  };
};
