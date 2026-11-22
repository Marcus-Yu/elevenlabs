import { useEffect, useRef, useState } from "react";
import { CommitStrategy, useScribe } from "@elevenlabs/react";
import { createScribeToken, speakBriefing } from "wasp/client/operations";

const FINAL_TRANSCRIPT_TIMEOUT_MS = 4_000;

interface VoiceControlsProps {
  goalId: string;
  consentGranted: boolean;
  onUseTranscript: (text: string) => void;
}

export function VoiceControls({ goalId, consentGranted, onUseTranscript }: VoiceControlsProps) {
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [briefingError, setBriefingError] = useState("");
  const [briefing, setBriefing] = useState<{ goalId: string; text: string; audio: string }>();
  const requestVersion = useRef(0);
  const finalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scribe = useScribe({
    modelId: "scribe_v3_live",
    commitStrategy: CommitStrategy.VAD,
    onCommittedTranscript: () => {
      if (finalTimer.current !== null) stop();
    },
  });
  const { disconnect } = scribe;
  const connecting = starting || scribe.status === "connecting";
  const transcript = scribe.committedTranscripts.map(segment => segment.text.trim()).filter(Boolean).join(" ");
  const currentBriefing = consentGranted && briefing?.goalId === goalId ? briefing : undefined;

  function stop() {
    if (finalTimer.current !== null) clearTimeout(finalTimer.current);
    finalTimer.current = null;
    disconnect();
    setFinishing(false);
  }

  useEffect(() => {
    if (!consentGranted) {
      requestVersion.current++;
      if (finalTimer.current !== null) clearTimeout(finalTimer.current);
      finalTimer.current = null;
      disconnect();
      setFinishing(false);
      setBriefing(undefined);
    }
    return () => {
      requestVersion.current++;
      if (finalTimer.current !== null) clearTimeout(finalTimer.current);
      finalTimer.current = null;
    };
  }, [consentGranted, disconnect]);

  async function start() {
    const version = requestVersion.current;
    setTranscriptionError("");
    setStarting(true);
    scribe.clearTranscripts();
    try {
      const { token } = await createScribeToken();
      if (version !== requestVersion.current) return;
      await scribe.connect({ token, microphone: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setTranscriptionError("Could not start transcription. Check microphone permission and voice service availability.");
    } finally {
      setStarting(false);
    }
  }

  function finish() {
    setFinishing(true);
    try {
      scribe.mute();
      const hadPartial = Boolean(scribe.partialTranscript);
      finalTimer.current = setTimeout(() => {
        stop();
        if (hadPartial) setTranscriptionError("The final segment did not arrive. You can review any completed text in the thread.");
      }, FINAL_TRANSCRIPT_TIMEOUT_MS);
      scribe.commit();
    } catch {
      stop();
      setTranscriptionError("Could not finish transcription. You can review any completed text in the thread.");
    }
  }

  async function speak() {
    const version = requestVersion.current;
    setBriefingError("");
    setBriefing(undefined);
    setSpeaking(true);
    try {
      const result = await speakBriefing({ goalId });
      if (version === requestVersion.current) setBriefing({ goalId, ...result });
    } catch {
      setBriefingError("Could not generate the spoken briefing. Check voice service availability.");
    } finally {
      setSpeaking(false);
    }
  }

  return (
    <section aria-label="Voice controls">
      <h2>Live transcription</h2>
      <button type="button" disabled={!consentGranted || connecting || scribe.isConnected || finishing} onClick={() => void start()}>Start microphone</button>{" "}
      <button type="button" disabled={!scribe.isConnected || finishing} onClick={finish}>Stop microphone</button>
      <p role="status">{finishing ? "Finishing transcription…" : connecting ? "Opening microphone…" : scribe.isConnected ? "Microphone active" : "Microphone off"}</p>
      {scribe.isConnected && scribe.partialTranscript && <p>Live text: {scribe.partialTranscript}</p>}
      {transcript && <p>{transcript}</p>}
      <button type="button" disabled={!transcript || connecting || scribe.isConnected || finishing} onClick={() => onUseTranscript(transcript)}>Use transcript in thread</button>
      {(transcriptionError || scribe.error) && <p role="alert">{transcriptionError || "Transcription stopped due to a connection error."}</p>}
      <h2>Spoken match briefing</h2>
      <button type="button" disabled={!consentGranted || !goalId || speaking} onClick={() => void speak()}>{speaking ? "Preparing briefing…" : "Prepare spoken briefing"}</button>
      {currentBriefing && <>
        <p>{currentBriefing.text}</p>
        <audio controls aria-label="Spoken match briefing" src={`data:audio/mpeg;base64,${currentBriefing.audio}`} />
      </>}
      {briefingError && <p role="alert">{briefingError}</p>}
    </section>
  );
}
