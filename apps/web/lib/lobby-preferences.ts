'use client';
import { useEffect, useState } from 'react';
export function useAllowBots() {
  const [allowBots, setValue] = useState(false);
  useEffect(() => {
    try {
      setValue(localStorage.getItem('triad-custom-allow-bots') === 'on');
    } catch {}
  }, []);
  function setAllowBots(value: boolean) {
    setValue(value);
    try {
      localStorage.setItem('triad-custom-allow-bots', value ? 'on' : 'off');
    } catch {}
  }
  return [allowBots, setAllowBots] as const;
}
