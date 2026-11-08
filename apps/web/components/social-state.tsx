'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { CHAT_CHANNELS, type ChatChannel, type SocialView } from '@gacha-triad/shared/social';
import { useSession } from './session';
import { api } from '../lib/platform';
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
  const [state, setState] = useState({ data: empty, error: '', ready: false });
  const [channel, setChannelState] = useState<ChatChannel>('general');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('triad-chat-channel') as ChatChannel;
      if (CHAT_CHANNELS.includes(saved)) setChannelState(saved);
    } catch {}
  }, []);
  function setChannel(next: ChatChannel) {
    setChannelState(next);
    try {
      localStorage.setItem('triad-chat-channel', next);
    } catch {}
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
  return <Context.Provider value={{ ...state, channel, setChannel }}>{children}</Context.Provider>;
}
export function openFriendChat(playerId: string) {
  window.dispatchEvent(new CustomEvent('triad:friend-chat', { detail: playerId }));
}
