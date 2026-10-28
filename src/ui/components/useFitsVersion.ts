import { useSyncExternalStore } from 'react';
import { fitsVersion, subscribeFits } from '../../stats/fitService';

/** Changes when a fit made off the main thread is done: a view that shows a fit depends on it, so it is drawn again with the fit. */
export const useFitsVersion = (): number => useSyncExternalStore(subscribeFits, fitsVersion, fitsVersion);
