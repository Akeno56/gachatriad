'use client';
import { LocaleView } from './i18n';

import { createContext, useContext, useEffect, useState } from 'react';
import { type ChatChannel, type SocialView } from '@gacha-triad/shared/social';
import { useSession } from './session';
import { api } from '../lib/platform';
import { usePathname } from 'next/navigation';
const empty: SocialView = {
  friends: [],
  invitations: [],
  chat: [],
  conversations: [],
  onlinePlayers: [],
};
const Context = createContext({
  data: empty,
  error: '',
  ready: false,
  channel: 'general' as ChatChannel,
  setChannel: (_channel: ChatChannel) => {},
});
export const useSocial = () => useContext(Context);
export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { profile, revision } = useSession();
  const pathname = usePathname();
  const [state, setState] = useState({ data: empty, error: '', ready: false });
  const [channel, setChannelState] = useState<ChatChannel>('general');
  useEffect(() => {
    setChannelState(
      pathname.startsWith('/lobbies')
        ? 'lobbies'
        : pathname.startsWith('/market')
          ? 'trade'
          : 'general',
    );
  }, [pathname]);
  function setChannel(next: ChatChannel) {
    setChannelState(next);
  }
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
  return (
    <LocaleView>
      <Context.Provider value={{ ...state, channel, setChannel }}>{children}</Context.Provider>
    </LocaleView>
  );
}
export function openFriendChat(playerId: string) {
  window.dispatchEvent(new CustomEvent('triad:friend-chat', { detail: playerId }));
}
