'use client';

import { useEffect, useState } from 'react';
import type { SiteArea } from '@gacha-triad/shared/platform';

const eventName = 'triad:site-update';
interface SiteUpdate {
  areas: readonly SiteArea[];
  identityId?: string;
}

export function publishSiteUpdate(...areas: SiteArea[]) {
  dispatchSiteUpdate({ areas });
}

export function dispatchSiteUpdate(detail: SiteUpdate) {
  window.dispatchEvent(new CustomEvent<SiteUpdate>(eventName, { detail }));
}

export function useSiteRevision(area: SiteArea, identityId?: string) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const onUpdate = (event: Event) => {
      const update = (event as CustomEvent<SiteUpdate>).detail;
      if (update.areas.includes(area) && (!identityId || identityId === update.identityId))
        setRevision((value) => value + 1);
    };
    window.addEventListener(eventName, onUpdate);
    return () => window.removeEventListener(eventName, onUpdate);
  }, [area, identityId]);
  return revision;
}
