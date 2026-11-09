'use client';
import { LocaleView } from './i18n';

import { useEffect, useRef, useState } from 'react';
import {
  appPath,
  normalizeServerURL,
  serverURL,
  serverConfigured,
  STATIC_BUILD,
  LOCAL_TEST_BUILD,
} from '../lib/connection';
export function ServerConnection({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(STATIC_BUILD),
    [open, setOpen] = useState(false),
    [address, setAddress] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const incoming = LOCAL_TEST_BUILD ? null : new URLSearchParams(location.search).get('server');
    setAddress(incoming || serverURL());
    setBlocked(!serverConfigured() || (!!incoming && incoming !== serverURL()));
    const show = () => {
      setAddress(serverURL());
      setOpen(true);
    };
    window.addEventListener('triad:connection-settings', show);
    return () => window.removeEventListener('triad:connection-settings', show);
  }, []);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const url = normalizeServerURL(address);
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok || (await response.json()).ok !== true)
        throw new Error('The game server is unavailable. Ask the host to start it.');
      localStorage.setItem('triad-server', url);
      location.assign(appPath('/'));
    } catch (e) {
      setError(
        (e as Error).name === 'TypeError'
          ? 'Cannot reach this server. Check that the host started it and allowed this site’s address.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const form = (
    <form onSubmit={connect} className="server-connect-form">
      <label>
        Game server address
        <input
          type="url"
          required
          value={address}
          placeholder="https://your-session.trycloudflare.com"
          onChange={(e) => setAddress(e.target.value)}
        />
      </label>
      <p>
        The host’s PC runs the shared world. Use the HTTPS link from their server control panel.
        Your accounts and progress belong to that server.
      </p>
      <button className="primary-button" disabled={busy}>
        {busy ? 'Connecting…' : 'Connect to server'}
      </button>
      <p className="error-message" role="alert">
        {error}
      </p>
    </form>
  );
  return (
    <LocaleView>
      <>
        {blocked ? (
          <section className="content-page connect-page">
            <div className="menu-window connect-window">
              <div className="eyebrow">ENTER THE CARD HALL</div>
              <h1>Connect to the host</h1>
              {form}
            </div>
          </section>
        ) : (
          children
        )}
        <dialog
          ref={ref}
          className="game-dialog menu-window connection-dialog"
          aria-label="Game server connection"
          onCancel={() => setOpen(false)}
        >
          <button
            className="dialog-close"
            aria-label="Close server connection"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <h2>Game server</h2>
          {form}
          {!STATIC_BUILD && (
            <button
              className="text-button"
              onClick={() => {
                localStorage.removeItem('triad-server');
                location.assign(appPath('/'));
              }}
            >
              Use local server
            </button>
          )}
        </dialog>
      </>
    </LocaleView>
  );
}
