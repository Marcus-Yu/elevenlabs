import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  confirmCriteriaChange, createHireGoal, getHireRuns, getModelProcessingConsent, getThreadSettings, rejectMatchWithReason,
  runHireShortlist, startThreadCalibration, submitThreadCalibration, useQuery,
} from 'wasp/client/operations';
import { ModelProcessingConsent } from '../voice/ModelProcessingConsent';
import { AssistantThread } from './AssistantThread';
import { HiringWorkflow, type HiringTransport } from './HiringWorkflow';

const hiringTransport: HiringTransport = {
  create: createHireGoal,
  shortlist: runHireShortlist,
  reject: rejectMatchWithReason,
  confirm: confirmCriteriaChange,
  runs: getHireRuns,
  startCalibration: startThreadCalibration,
  submitCalibration: submitThreadCalibration,
};

export function ThreadPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: settings } = useQuery(getThreadSettings);
  const consent = useQuery(getModelProcessingConsent);
  const [voiceDraft] = useState(() => {
    const state = location.state as { hiringNeed?: unknown } | null;
    return typeof state?.hiringNeed === 'string' ? state.hiringNeed.slice(0, 2000) : '';
  });
  const [reviewedDraft, setReviewedDraft] = useState<{ need: string }>();
  useEffect(() => {
    if (location.state && typeof location.state === 'object' && 'hiringNeed' in location.state) {
      const { hiringNeed: _ignored, ...remaining } = location.state as Record<string, unknown>;
      void navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true, state: Object.keys(remaining).length ? remaining : null,
      });
    }
  }, [location, navigate]);
  return <main className="space-y-8">
    <header><h1 className="text-2xl font-semibold">Hire a robotics engineer</h1><p>Describe the hire, calibrate, find sourced candidates, and tell Atlas what to change.</p></header>
    <ModelProcessingConsent description="Allow Atlas to send assistant messages to Anthropic. This setting also allows ElevenLabs to process audio and briefing text when you use Voice." />
    <AssistantThread canSend={consent.data?.granted === true && !consent.error} onReviewHiringGoal={need => setReviewedDraft({ need })} />
    <HiringWorkflow initialDraft={voiceDraft} reviewedDraft={reviewedDraft} shortlistReplay={settings?.shortlistReplay} transport={hiringTransport} />
  </main>;
}
