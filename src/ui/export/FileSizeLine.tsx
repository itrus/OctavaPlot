import { useEffect, useRef, useState } from 'react';

/** A change of the graph or the settings is waited out for this long before the file is made again. */
const DELAY_MS = 400;

/** A size in KB (ten thousand KB or more in MB), as the panels write it. */
export function formatKb(bytes: number): string {
  const kb = Math.max(1, Math.round(bytes / 1024));
  return kb >= 10000 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

/**
 * "File size: 134 KB" for the file an export panel would write. `measure` makes that file in memory and returns its bytes (it must be the same
 * function while nothing changes, so keep it in useMemo); null when there is nothing to measure. The size is the real one: a PNG is
 * rendered at the chosen resolution, which takes a few seconds at a high one.
 */
export function FileSizeLine({ measure }: { measure: (() => Promise<number>) | null }) {
  const [state, setState] = useState<{ bytes: number | null; busy: boolean }>({ bytes: null, busy: true });
  // Only the latest request may set the state: a slow older one is dropped.
  const latest = useRef(0);
  useEffect(() => {
    if (!measure) {
      latest.current++;
      setState({ bytes: null, busy: false });
      return;
    }
    const mine = ++latest.current;
    setState((s) => ({ ...s, busy: true }));
    const timer = setTimeout(() => {
      const done = (bytes: number | null) => latest.current === mine && setState({ bytes, busy: false });
      measure().then(done, () => done(null));
    }, DELAY_MS);
    return () => {
      clearTimeout(timer);
      latest.current++;
    };
  }, [measure]);
  return (
    <div className="file-size" role="status">
      File size: {state.busy ? 'calculating…' : state.bytes === null ? 'not available' : formatKb(state.bytes)}
    </div>
  );
}
