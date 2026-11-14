import { useEffect, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { exportFileName } from '../../util/fileName';

/**
 * The name the file of an export will have: the safe name of what is exported, the date and time when Settings says so, and the
 * extension. It is the name the Export button shows and the name the file is written with, so the two are the same. The time moves
 * on with the clock (at each change of the minute) only while a time is part of the name.
 */
export function useExportFileName(base: string, ext: string): string {
  const { settings } = useApp();
  const stamped = settings.timestampExports;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!stamped) return;
    // Just after the next change of the minute: the stamp has minutes, so nothing changes sooner.
    const id = setTimeout(() => setNow(new Date()), 60_000 - (Date.now() % 60_000) + 20);
    return () => clearTimeout(id);
  }, [stamped, now]);
  return exportFileName(base, ext, stamped, now);
}
