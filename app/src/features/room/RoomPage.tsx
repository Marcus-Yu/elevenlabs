import { appendRoomSentence, finishRoomRun, listPitchGoals, startRoomRun, useQuery } from 'wasp/client/operations';
import { RoomWorkspace } from './RoomWorkspace';

export function RoomPage() {
  const goals = useQuery(listPitchGoals);
  return <RoomWorkspace goals={goals.data ?? []} loadingGoals={goals.isLoading}
    goalsError={goals.error ? 'Could not load your goals. Please try again.' : undefined}
    transport={{ start: startRoomRun, append: appendRoomSentence, finish: finishRoomRun }} />;
}
