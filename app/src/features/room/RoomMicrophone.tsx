import { useEffect, useRef, useState } from 'react';
import { CommitStrategy, useScribe } from '@elevenlabs/react';
import { createScribeToken } from 'wasp/client/operations';

/** Streams only with account consent. The parent serializes committed sentences. */
export function RoomMicrophone({ consentGranted, disabled, onSentence, onActiveChange }: {
  consentGranted: boolean; disabled: boolean; onSentence: (text: string) => void; onActiveChange: (active: boolean) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const scribe = useScribe({ modelId: 'scribe_v3_live', commitStrategy: CommitStrategy.VAD,
    onCommittedTranscript: ({ text }) => {
      if (!active.current) return;
      for (const part of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)) {
        if (part.segment.trim()) onSentence(part.segment.trim());
      }
      if (timer.current !== null) finish();
    },
    onDisconnect: () => {
      if (active.current) {
        finish();
        setError('Transcription disconnected. Review the transcript and enter any missing text before measuring.');
      }
    },
  });
  const { disconnect } = scribe;
  function finish() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    active.current = false;
    disconnect();
    setFinishing(false);
    onActiveChange(false);
  }
  useEffect(() => {
    if (!consentGranted) {
      version.current++;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      active.current = false;
      disconnect();
      setFinishing(false);
      setStarting(false);
      onActiveChange(false);
    }
  }, [consentGranted, disconnect, onActiveChange]);
  useEffect(() => () => {
    version.current++;
    active.current = false;
    if (timer.current !== null) clearTimeout(timer.current);
    disconnect();
  }, [disconnect]);
  async function start() {
    const current = version.current;
    setError(''); setStarting(true); onActiveChange(true);
    try {
      const { token } = await createScribeToken();
      if (current !== version.current) return;
      active.current = true;
      await scribe.connect({ token, microphone: { echoCancellation: true, noiseSuppression: true } });
      if (current !== version.current) disconnect();
    } catch {
      if (current === version.current) { finish(); setError('Could not start transcription. Check microphone permission and voice service availability.'); }
    } finally { if (current === version.current) setStarting(false); }
  }
  function stop() {
    setFinishing(true);
    try {
      scribe.mute();
      timer.current = setTimeout(() => {
        finish();
        setError('The final segment did not arrive. Review the transcript and enter missing text before measuring.');
      }, 4_000);
      scribe.commit();
    } catch {
      finish(); setError('Could not finish transcription. Review the transcript and enter missing text before measuring.');
    }
  }
  return <section aria-label="Room microphone">
    <button type="button" disabled={disabled || !consentGranted || starting || finishing || scribe.isConnected} onClick={() => void start()}>Start microphone</button>{' '}
    <button type="button" disabled={!scribe.isConnected || finishing} onClick={stop}>Stop microphone</button>
    <p role="status">{finishing ? 'Finishing transcription…' : starting ? 'Opening microphone…' : scribe.isConnected ? 'Microphone active' : 'Microphone off'}</p>
    {scribe.isConnected && scribe.partialTranscript && <p>Live text: {scribe.partialTranscript}</p>}
    {(error || scribe.error) && <p role="alert">{error || 'Transcription stopped due to a connection error. Stop the microphone and review the transcript.'}</p>}
  </section>;
}
