import { listPitchGoals, scorePitchRun, useQuery } from 'wasp/client/operations';
import { PitchWorkspace } from './PitchWorkspace';
import { ModelProcessingConsent } from '../voice/ModelProcessingConsent';

/** The operation owns authorization, panel construction, scoring and persistence. */
export function PitchPage() {
  const goals = useQuery(listPitchGoals);
  return <><ModelProcessingConsent description="Allow Atlas to send pitch text for simulated scoring." /><PitchWorkspace goals={goals.data ?? []} loadingGoals={goals.isLoading}
    goalsError={goals.error ? 'Could not load your goals. Please try again.' : undefined}
    score={scorePitchRun} /></>;
}
