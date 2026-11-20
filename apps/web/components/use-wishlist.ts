'use client';

import { useEffect, useRef, useState } from 'react';
import type { WishlistEntry } from '@gacha-triad/shared/platform';
import { api } from '../lib/platform';

export function useWishlist(owner: string | undefined, revision = 0) {
  const [snapshot, setSnapshot] = useState<{ owner: string; rows: WishlistEntry[] } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const version = useRef(0);
  const rows = snapshot?.owner === owner ? snapshot?.rows : null;
  useEffect(() => {
    if (!owner) return;
    let active = true;
    const stamp = version.current;
    void api<WishlistEntry[]>('/wishlist').then(
      (rows) => {
        if (active && stamp === version.current) {
          setSnapshot({ owner, rows });
          setError('');
        }
      },
      (e: Error) => {
        if (active && stamp === version.current) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [owner, revision]);

  async function save(cardId: string, saved: boolean) {
    if (!rows || saving.current) return;
    saving.current = true;
    setPending(cardId);
    setError('');
    try {
      await api('/wishlist', { cardId, saved });
      version.current++;
      setSnapshot((current) => {
        if (!current || current.owner !== owner) return current;
        const next = current.rows.filter((entry) => entry.cardId !== cardId);
        return {
          ...current,
          rows: saved ? [{ cardId, listings: 0, requestId: null }, ...next] : next,
        };
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setPending(null);
    }
  }
  return { rows, pending, error, save };
}
