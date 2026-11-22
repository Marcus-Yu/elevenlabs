import { useNavigate, useSearchParams } from "react-router";
import { getModelProcessingConsent, listVoiceHireGoals, useQuery } from "wasp/client/operations";
import { ModelProcessingConsent } from "./ModelProcessingConsent";
import { VoiceControls } from "./VoiceControls";

export function VoicePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const goals = useQuery(listVoiceHireGoals);
  const consent = useQuery(getModelProcessingConsent);
  const linkedGoal = searchParams.get("goalId");
  const activeGoals = goals.data ?? [];
  const goalId = linkedGoal === null
    ? activeGoals[0]?.id ?? ""
    : activeGoals.find(goal => goal.id === linkedGoal)?.id ?? "";

  return (
    <main>
      <h1>Voice</h1>
      <ModelProcessingConsent description="Allow Atlas to use model providers. Voice sends microphone audio and spoken briefing text to ElevenLabs." />
      <label htmlFor="voice-goal">Hiring goal for the spoken briefing</label>{" "}
      <select id="voice-goal" disabled={activeGoals.length === 0} value={goalId} onChange={event => {
        const params = new URLSearchParams(searchParams);
        params.set("goalId", event.target.value);
        setSearchParams(params, { replace: true });
      }}>
        {!goalId && <option value="" disabled>Select a hiring goal</option>}
        {activeGoals.map(goal => <option key={goal.id} value={goal.id}>{goal.statement}</option>)}
      </select>
      {goals.isLoading && <p role="status">Loading hiring goals…</p>}
      {goals.error && <p role="alert">Could not load your hiring goals.</p>}
      {!goals.isLoading && !goals.error && activeGoals.length === 0 && <p>Create a hiring goal in the thread to hear its briefing.</p>}
      {activeGoals.length > 0 && linkedGoal && !goalId && <p>The linked hiring goal is unavailable. Select one of your active hiring goals.</p>}
      <VoiceControls
        goalId={goalId}
        consentGranted={consent.data?.granted === true && !consent.error}
        onUseTranscript={hiringNeed => void navigate("/thread", { state: { hiringNeed } })}
      />
    </main>
  );
}
