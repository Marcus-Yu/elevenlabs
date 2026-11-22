import { appendRoomSentence, finishRoomRun, listPitchGoals, startRoomRun, useQuery } from 'wasp/client/operations';
import { getModelProcessingConsent } from 'wasp/client/operations';
import { ModelProcessingConsent } from '../voice/ModelProcessingConsent';
import { RoomWorkspace } from './RoomWorkspace';

export function RoomPage() {
  const goals = useQuery(listPitchGoals);
  const consent = useQuery(getModelProcessingConsent);
  return <><ModelProcessingConsent description="Allow model processing. The Room sends microphone audio to ElevenLabs and pitch text for simulated scoring." /><RoomWorkspace consentGranted={consent.data?.granted === true && !consent.error} goals={goals.data ?? []} loadingGoals={goals.isLoading}
    goalsError={goals.error ? 'Could not load your goals. Please try again.' : undefined}
    transport={{ start: startRoomRun, append: appendRoomSentence, finish: finishRoomRun }} /></>;
}
