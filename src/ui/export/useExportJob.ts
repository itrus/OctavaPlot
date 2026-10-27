import { useEffect, useRef, useState } from 'react';
import { createExportController, IDLE, isBusy, type ExportJob, type ExportOutcome, type ExportState } from './exportJob';

/** The export controller of a view: its state, whether an export is active, and a start that reports the outcome in the status line. */
export function useExportJob(setStatus: (message: string) => void) {
  const [state, setState] = useState<ExportState>(IDLE);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // One controller for the life of the view; its state is copied into React only while the view is on screen.
  const controller = useRef<ReturnType<typeof createExportController>>(undefined);
  controller.current ??= createExportController((s) => live.current && setState(s));
  const status = useRef(setStatus);
  status.current = setStatus;
  const start = async (job: ExportJob): Promise<ExportOutcome> => {
    const outcome = await controller.current!.start(job);
    if (outcome.kind !== 'ignored') status.current(outcome.message);
    return outcome;
  };
  return { state, busy: isBusy(state), start };
}
