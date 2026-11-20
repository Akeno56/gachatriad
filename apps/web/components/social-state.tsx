'use client';
import { LocaleView } from './i18n';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { type ChatChannel, type SocialView } from '@gacha-triad/shared/social';
import { useSession } from './session';
import { api } from '../lib/platform';
import { refreshScheduler } from '../lib/refresh-scheduler';
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
  const { profile, revision, socialRevision } = useSession();
  const pathname = usePathname();
  const owner = profile?.id;
  const [state, setState] = useState({ owner, data: empty, error: '', ready: false });
  const scheduler = useRef<ReturnType<typeof refreshScheduler> | null>(null);
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
  useEffect(() => {
    setState({ owner, data: empty, error: '', ready: false });
    if (!owner) return;
    let active = true;
    const pending = refreshScheduler(
      async () => {
        try {
          const data = await api<SocialView>('/social');
          if (active) setState({ owner, data, error: '', ready: true });
        } catch (e) {
          if (active) setState((current) => ({ ...current, error: (e as Error).message }));
        }
      },
      { interval: () => 500, visible: () => !document.hidden },
    );
    scheduler.current = pending;
    return () => {
      active = false;
      pending.close();
      scheduler.current = null;
    };
  }, [owner]);
  useEffect(() => scheduler.current?.request(), [owner, revision, socialRevision]);
  const visible = state.owner === owner ? state : { data: empty, error: '', ready: false };
  return (
    <LocaleView>
      <Context.Provider value={{ ...visible, channel, setChannel }}>{children}</Context.Provider>
    </LocaleView>
  );
}
