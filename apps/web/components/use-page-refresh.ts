'use client';
import { useCallback, useEffect, useState } from 'react';
/** Snapshot pages do not need a new query for every live world notification. */
export function usePageRefresh(interval = 30000) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) refresh();
    };
    const timer = setInterval(visible, interval);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [interval, refresh]);
  return [revision, refresh] as const;
}
