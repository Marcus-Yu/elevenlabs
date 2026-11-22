import { useEffect, useRef, useState } from "react";
import { appendTranscriptEntry, type TranscriptEntry } from "./skeptic-session";

export interface SkepticSession {
  stop(): Promise<void>;
}

/** Integration supplies a gateway-authorized connection and only final, stably identified turns. */
export interface SkepticTransport {
  start(callbacks: { onFinalTurn: (turn: TranscriptEntry) => void; onDisconnect: () => void;
    onError: () => void }): Promise<SkepticSession>;
}

type Status = "disconnected" | "connecting" | "connected" | "disconnecting";

export function SkepticCall({ transport }: { transport: SkepticTransport }) {
  const [status, setStatus] = useState<Status>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const sessionRef = useRef<SkepticSession | null>(null);
  const generation = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = false;
    transcriptRef.current = [];
    setTranscript([]);
    setStatus("disconnected");
    setError(null);
    return () => {
      generation.current += 1;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void session.stop().catch(() => {});
    };
  }, [transport]);

  async function start() {
    if (busyRef.current) return;
    busyRef.current = true;
    const current = ++generation.current;
    transcriptRef.current = [];
    setTranscript([]);
    setError(null);
    setStatus("connecting");
    try {
      const session = await transport.start({
        onFinalTurn(turn) {
          if (generation.current !== current) return;
          try {
            const next = appendTranscriptEntry(transcriptRef.current, turn);
            transcriptRef.current = next;
            setTranscript(next);
          } catch {
            setError("A transcript turn could not be recorded.");
          }
        },
        onDisconnect() {
          if (generation.current !== current) return;
          generation.current += 1;
          sessionRef.current = null;
          busyRef.current = false;
          setStatus("disconnected");
        },
        onError() {
          if (generation.current === current) setError("The call encountered an error.");
        },
      });
      if (generation.current !== current) {
        await session.stop();
        return;
      }
      sessionRef.current = session;
      setStatus("connected");
    } catch {
      if (generation.current !== current) return;
      generation.current += 1;
      busyRef.current = false;
      setStatus("disconnected");
      setError("The call could not be started.");
    }
  }

  async function stop() {
    if (status !== "connected" && status !== "connecting") return;
    const current = ++generation.current;
    const session = sessionRef.current;
    sessionRef.current = null;
    setStatus("disconnecting");
    try {
      await session?.stop();
    } catch {
      if (generation.current === current) setError("The call could not be stopped cleanly.");
    } finally {
      if (generation.current === current) {
        busyRef.current = false;
        setStatus("disconnected");
      }
    }
  }

  return (
    <section aria-label="Skeptic call">
      <h2>Skeptic call</h2>
      <p>Practice with a simulated skeptic.</p>
      <p role="status">Call status: {status}</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={status !== "disconnected"} onClick={() => void start()}>Start call</button>
      <button type="button" disabled={status !== "connected" && status !== "connecting"} onClick={() => void stop()}>End call</button>
      <h3>Transcript</h3>
      {transcript.length === 0 ? <p>No final turns yet.</p> : (
        <ol>{transcript.map((turn) => <li key={turn.id}>
          <strong>{turn.role === "agent" ? "Skeptic" : "You"}:</strong> {turn.content.text}
        </li>)}</ol>
      )}
    </section>
  );
}
