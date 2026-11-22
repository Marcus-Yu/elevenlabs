import { listPitchGoals, scorePitchRun, useQuery } from 'wasp/client/operations';
import { PitchWorkspace } from './PitchWorkspace';

/** The operation owns authorization, panel construction, scoring and persistence. */
export function PitchPage() {
  const goals = useQuery(listPitchGoals);
  return <PitchWorkspace goals={goals.data ?? []} loadingGoals={goals.isLoading}
    goalsError={goals.error ? 'Could not load your goals. Please try again.' : undefined}
    score={scorePitchRun} />;
}
