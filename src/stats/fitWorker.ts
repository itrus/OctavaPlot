/** The Web Worker that makes curve fits off the main thread. All it does is `handleFitMessage` (fitEngine.ts), which the tests run too. */
import { handleFitMessage, type FitAnswer, type FitMessage } from './fitEngine';

const scope = self as unknown as { onmessage: ((e: { data: FitMessage }) => void) | null; postMessage(m: FitAnswer): void };
scope.onmessage = (e) => scope.postMessage(handleFitMessage(e.data));
