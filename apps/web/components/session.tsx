'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ProfileView } from '@gacha-triad/shared/platform';
import { api, session, resetSession, ApiError } from '../lib/platform';
import {
  serverConfigured,
  socketURL,
  sessionToken,
  profileKey,
  clearToken,
} from '../lib/connection';
const Context = createContext<{
  profile: ProfileView | null;
  error: string;
  revision: number;
  refresh: () => Promise<void>;
  changeAccount: (work: () => Promise<unknown>) => Promise<void>;
  accountOpen: boolean;
  openAccount: () => void;
  closeAccount: () => void;
}>({
  profile: null,
  error: '',
  revision: 0,
  refresh: async () => {},
  changeAccount: async () => {},
  accountOpen: false,
  openAccount: () => {},
  closeAccount: () => {},
});
export const useSession = () => useContext(Context);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileView | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const openAccount = useCallback(() => setAccountOpen(true), []),
    closeAccount = useCallback(() => setAccountOpen(false), []);
  const pending = useRef<Promise<void> | null>(null);
  const changingAccount = useRef(false);
  const refresh = useCallback(async () => {
    if (!serverConfigured() || changingAccount.current) return;
    if (pending.current) return pending.current;
    pending.current = (async () => {
      try {
        await session();
        let next: ProfileView;
        try {
          next = await api<ProfileView>('/profile');
        } catch (e) {
          if (localStorage.getItem(profileKey())) {
            localStorage.removeItem(profileKey());
            next = await api<ProfileView>('/profile');
          } else if (e instanceof ApiError && e.status === 401) {
            await api('/auth/sign-out', {}).catch(() => {});
            clearToken();
            resetSession();
            await session();
            next = await api<ProfileView>('/profile');
          } else throw e;
        }
        setProfile(next);
        setError('');
        setRevision((v) => v + 1);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        pending.current = null;
      }
    })();
    return pending.current;
  }, []);
  const changeAccount = useCallback(
    async (work: () => Promise<unknown>) => {
      if (changingAccount.current) return;
      changingAccount.current = true;
      try {
        // Drain the old guest/account refresh before replacing its session cookie or token.
        await pending.current;
        await work();
        resetSession();
      } finally {
        changingAccount.current = false;
      }
      await refresh();
    },
    [refresh],
  );
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!profile) return;
    const socket: Socket = io(socketURL(), {
      withCredentials: true,
      auth: (callback) => callback({ profileId: profile.id, token: sessionToken() }),
    });
    socket.on('platform:changed', () => void refresh());
    socket.on('connect', () => void refresh());
    return () => {
      socket.disconnect();
    };
  }, [profile?.id, profile?.registered, refresh]);
  return (
    <Context.Provider
      value={{
        profile,
        error,
        revision,
        refresh,
        changeAccount,
        accountOpen,
        openAccount,
        closeAccount,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function AccountMenu() {
  const {
    profile,
    error,
    changeAccount,
    accountOpen: open,
    openAccount,
    closeAccount,
  } = useSession();
  const setOpen = (value: boolean) => (value ? openAccount() : closeAccount());
  const [register, setRegister] = useState(true),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage('');
    const fields: Record<string, string> = {};
    new FormData(e.currentTarget).forEach((value, key) => {
      fields[key] = String(value);
    });
    try {
      await changeAccount(() =>
        api(register ? '/auth/sign-up/email' : '/auth/sign-in/email', { ...fields }),
      );
      setOpen(false);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function logout() {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      await changeAccount(async () => {
        await api('/auth/sign-out', {});
        localStorage.removeItem(profileKey());
      });
      setOpen(false);
    } catch (e) {
      setMessage((e as Error).message);
      setOpen(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <button
        className="account-control"
        disabled={pending}
        onClick={() => (profile?.registered ? void logout() : setOpen(true))}
      >
        {profile?.registered
          ? 'Logout'
          : !profile && serverConfigured() && !error
            ? 'Connecting…'
            : 'Login/Register'}
      </button>
      <dialog ref={ref} className="game-dialog account-dialog" onCancel={() => setOpen(false)}>
        <button className="dialog-close" onClick={() => setOpen(false)} aria-label="Close account">
          ×
        </button>
        <h2>
          {profile?.registered ? 'Your account' : register ? 'Keep your progress' : 'Welcome back'}
        </h2>
        {profile?.registered ? (
          <>
            <p>
              {profile.name} · Rating {profile.rating} · Draft {profile.draftRating}
            </p>
            <button className="outline-button" disabled={pending} onClick={() => void logout()}>
              Logout
            </button>
          </>
        ) : (
          <>
            <p>
              Your guest collection is kept when you register. An account is required for ranked,
              rated Draft and Trade One.
            </p>
            <form onSubmit={submit}>
              {register && (
                <label>
                  Player name
                  <input required name="name" maxLength={32} autoComplete="nickname" />
                </label>
              )}
              <label>
                Email
                <input required name="email" type="email" autoComplete="email" />
              </label>
              <label>
                Password
                <input
                  required
                  name="password"
                  type="password"
                  minLength={10}
                  autoComplete={register ? 'new-password' : 'current-password'}
                />
              </label>
              <button className="primary-button" disabled={pending}>
                {pending ? 'Connecting…' : register ? 'Create account' : 'Sign in'}
              </button>
            </form>
            <button className="text-button" onClick={() => setRegister(!register)}>
              {register ? 'Already registered? Sign in' : 'Create a new account'}
            </button>
          </>
        )}
        <p role="alert">{message || error}</p>
      </dialog>
    </>
  );
}
