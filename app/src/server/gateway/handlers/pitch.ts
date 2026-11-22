import { ScoreRequestSchema } from '../../../shared/contracts/sim';
import { createHttpClient, resolveAdapterMode, type HttpClient } from '../../adapters/http';
import { createSimAdapter } from '../../adapters/sim';
import { defineHandler, type HandlerMap } from '../types';

/** The adapter enforces the response matrix and never records private pitch text. */
export function createPitchHandlers(client: HttpClient, baseUrl: string): HandlerMap {
  const sim = createSimAdapter(client, baseUrl);
  return { 'pitch.score': defineHandler({ payload: ScoreRequestSchema, async run(input) {
    const { score } = await sim.score(input);
    return { data: score };
  } }) };
}

export function createPitchHandlersFromEnv(env: NodeJS.ProcessEnv): HandlerMap {
  const mode = resolveAdapterMode(env.SIM_PITCH_MODE ?? env.ADAPTER_MODE);
  return createPitchHandlers(createHttpClient({ mode, fixturesDir: env.FIXTURES_DIR }), env.SIM_URL || 'http://localhost:8000');
}
