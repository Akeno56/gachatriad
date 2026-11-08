'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { SocialView } from '@gacha-triad/shared/social';
import { useSession } from './session';
import { api } from '../lib/platform';
const empty: SocialView = { friends: [], invitations: [], chat: [], conversations: [] };
const Context = createContext({ data: empty, error: '', ready: false });
export const useSocial = () => useContext(Context);
export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { profile, revision } = useSession();
  const [state, setState] = useState({ data: empty, error: '', ready: false });
  useEffect(() => setState({ data: empty, error: '', ready: false }), [profile?.id]);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    void api<SocialView>('/social')
      .then((data) => {
        if (active) setState({ data, error: '', ready: true });
      })
      .catch((e) => {
        if (active) setState((current) => ({ ...current, error: e.message }));
      });
    return () => {
      active = false;
    };
  }, [profile?.id, revision]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function openFriendChat(playerId: string) {
  window.dispatchEvent(new CustomEvent('triad:friend-chat', { detail: playerId }));
}
