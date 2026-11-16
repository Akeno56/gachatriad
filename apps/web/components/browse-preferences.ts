'use client';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useSession } from './session';
import { serverURL } from '../lib/connection';
type Primitive = string | number | boolean;
export function browseKey(page: string, owner: string) {
  return `triad-browse:${serverURL()}:${owner}:${page}`;
}
export function useBrowseState<T extends Primitive>(
  page: string,
  field: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const { profile } = useSession();
  const key = profile ? `${browseKey(page, profile.id)}:${field}` : '';
  const [setting, setSetting] = useState({ key: '', value: initial, edited: false });
  useEffect(() => {
    if (!key) return;
    let value = initial;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (
        typeof saved === typeof initial &&
        (typeof saved !== 'number' || (Number.isSafeInteger(saved) && saved >= 0))
      )
        value = saved as T;
    } catch {
      /* Browsing preferences are optional. */
    }
    // A player can use public filters while their profile is still connecting.
    // Restoring preferences must not replace that newer input.
    setSetting((current) =>
      current.key === key
        ? current
        : {
            key,
            value: current.key === '' && current.edited ? current.value : value,
            edited: false,
          },
    );
  }, [key, initial]);
  useEffect(() => {
    if (key && setting.key === key) {
      try {
        sessionStorage.setItem(key, JSON.stringify(setting.value));
      } catch {}
    }
  }, [key, setting]);
  const value = setting.key === key ? setting.value : initial;
  const setValue: Dispatch<SetStateAction<T>> = (next) =>
    setSetting((current) => ({
      key,
      value:
        typeof next === 'function' ? next(current.key === key ? current.value : initial) : next,
      edited: true,
    }));
  return [value, setValue];
}
/** Store only scroll position in this tab; never store private card or account data. */
export function useBrowseScroll(page: string, ready: boolean) {
  const { profile } = useSession();
  const key = profile ? `${browseKey(page, profile.id)}:scroll` : '';
  useEffect(() => {
    if (!key || !ready) return;
    const path = location.pathname;
    let saved = 0,
      last = 0,
      frame = 0,
      timer: ReturnType<typeof setTimeout> | null = null;
    try {
      saved = Math.max(0, Number(sessionStorage.getItem(key)) || 0);
    } catch {}
    const write = () => {
      try {
        sessionStorage.setItem(key, String(last));
      } catch {}
      timer = null;
    };
    const scroll = () => {
      if (location.pathname !== path) return;
      last = window.scrollY;
      if (!timer) timer = setTimeout(write, 200);
    };
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        // Next already starts new pages at the top. Do not undo a scroll made
        // while this page or its account data was loading.
        if (saved > 0 && window.scrollY === 0) window.scrollTo(0, saved);
        last = window.scrollY;
        window.addEventListener('scroll', scroll, { passive: true });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scroll);
      if (timer) clearTimeout(timer);
      write();
    };
  }, [key, ready]);
}
