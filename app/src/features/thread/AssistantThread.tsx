import { useMemo, useState } from 'react';
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePartPrimitive, MessagePrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { useChatRuntime } from '@assistant-ui/ai-sdk';
import { DefaultChatTransport } from 'ai';
import { config } from 'wasp/client';
import { getSessionId } from 'wasp/client/api';
import { submitThreadCalibration } from 'wasp/client/operations';
import { CalibrationCard, type CalibrationProfile, type CalibrationReaction } from './CalibrationCard';
import { CalibrationCriteriaReview } from './CalibrationCriteriaReview';
import type { CalibrationCriteria } from './calibration-contracts';
import { goalProposal } from './goal-proposal';
import { ThreadApprovalCard } from './ThreadApprovalCard';

function ToolResult({ name, result, onReviewHiringGoal }: {
  name: string;
  result: unknown;
  onReviewHiringGoal: (need: string) => void;
}) {
  const [review, setReview] = useState<{ criteria: CalibrationCriteria; reactions: CalibrationReaction[] } | null>(null);
  if (!result || typeof result !== 'object') return <p>Working on {name}…</p>;
  const display = result as { kind?: string; approvalId?: string; ruleId?: string; data?: { profiles?: CalibrationProfile[]; source?: string } };
  if (display.kind === 'pending_approval' && display.approvalId) return <ThreadApprovalCard approvalId={display.approvalId} />;
  if (display.kind === 'denied') return <p>Action denied by policy. Rule {display.ruleId}.</p>;
  if (name === 'propose_goal' && display.kind === 'allowed') {
    const parsed = goalProposal.safeParse(display.data);
    if (parsed.success) return <section className="rounded border p-3">
      <h3 className="font-semibold">Proposed goal</h3><p>{parsed.data.statement}</p>
      {parsed.data.kind === 'hiring' && <button type="button" onClick={() => onReviewHiringGoal(parsed.data.statement)}>Review in hiring research</button>}
    </section>;
  }
  if (name === 'calibrate_profiles' && display.kind === 'allowed' && Array.isArray(display.data?.profiles)) {
    const profiles = display.data.profiles;
    const submit = async (reactions: CalibrationReaction[]) => {
      const response = await submitThreadCalibration({ profiles, reactions });
      if (response.kind !== 'allowed' || !response.data) throw new Error('Calibration failed');
      setReview({ criteria: response.data, reactions });
    };
    return <section><p>{display.data.source === 'replay' ? 'Curated synthetic replay profiles.' : 'Live-generated synthetic profiles.'}</p>
      <CalibrationCard profiles={profiles} onSubmit={submit} />
      {review && <CalibrationCriteriaReview criteria={review.criteria} profiles={profiles} reactions={review.reactions} />}
    </section>;
  }
  return <p>{display.kind === 'allowed' ? `${name} completed. See the related workspace for details.` : `${name}: result unavailable.`}</p>;
}

/** AI SDK's streaming transport uses Wasp's API URL and current bearer session. */
function chatErrorMessage(error: Error): string {
  try {
    const body = JSON.parse(error.message) as { error?: unknown; ruleId?: unknown } | null;
    if (body?.error === 'chat_denied' && typeof body.ruleId === 'string' && /^[a-z_]+$/.test(body.ruleId)) {
      return `Chat was denied by policy. Rule ${body.ruleId}.`;
    }
  } catch { /* unstructured network and provider errors use the generic status */ }
  return 'Chat is unavailable. Check your connection or model configuration and try again.';
}

export function AssistantThread({ canSend, onReviewHiringGoal }: { canSend: boolean; onReviewHiringGoal: (need: string) => void }) {
  const transport = useMemo(() => new DefaultChatTransport({ api: `${config.apiUrl}/api/chat`,
    headers: (): Record<string, string> => { const session = getSessionId(); return session ? { Authorization: `Bearer ${session}` } : {}; },
  }), []);
  const [error, setError] = useState('');
  const runtime = useChatRuntime({ transport, onError: (error) => setError(chatErrorMessage(error)) });
  return <AssistantRuntimeProvider runtime={runtime}><section aria-label="Assistant conversation" className="space-y-3">
    <h2 className="text-xl font-semibold">Assistant</h2>
    <p>Chat uses the configured model. Hiring research and synthetic calibration below remain available separately.</p>
    <ThreadPrimitive.Root><ThreadPrimitive.Viewport className="max-h-96 overflow-y-auto space-y-3">
      <ThreadPrimitive.Messages>{({ message }) => <MessagePrimitive.Root className="rounded border p-2">
        <strong>{message.role === 'user' ? 'You' : 'Atlas'}</strong>
        <MessagePrimitive.Parts>{({ part }) => {
          if (part.type === 'text') return <p className="whitespace-pre-wrap"><MessagePartPrimitive.Text /></p>;
          if (part.type === 'tool-call') return <ToolResult name={part.toolName} result={part.result} onReviewHiringGoal={onReviewHiringGoal} />;
          return null;
        }}</MessagePrimitive.Parts>
      </MessagePrimitive.Root>}</ThreadPrimitive.Messages>
    </ThreadPrimitive.Viewport>
    {canSend ? <ComposerPrimitive.Root onSubmit={() => setError('')} className="space-y-2"><ComposerPrimitive.Input aria-label="Message Atlas" placeholder="Ask Atlas about your goal" className="w-full border p-2" />
      <ComposerPrimitive.Send className="rounded border px-3 py-1 disabled:opacity-40">Send</ComposerPrimitive.Send></ComposerPrimitive.Root> : <p>Allow model processing to send an assistant message.</p>}
    </ThreadPrimitive.Root>{error && <p role="alert">{error}</p>}
  </section></AssistantRuntimeProvider>;
}
