'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/platform';
import { serverURL, clearToken, profileKey, appPath } from '../lib/connection';
import { LocaleView } from './i18n';
export function SocialLogin({ link = false }: { link?: boolean }) {
  const [providers, setProviders] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<string[]>('/social-providers')
      .then((p) => {
        if (active) setProviders(p);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!providers.length) return null;
  return (
    <LocaleView>
      <div className="social-login">
        {providers
          .filter((p) => p === 'google' || p === 'discord')
          .map((provider) => (
            <button
              type="button"
              key={provider}
              className="outline-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const origin = new URL(serverURL() || location.origin).origin;
                  const callbackURL = location.hostname.endsWith('github.io')
                    ? new URL('/profile', origin).href
                    : new URL(appPath('/profile'), location.origin).href;
                  const result = await api<{ url: string }>(
                    link ? '/auth/link-social' : '/auth/sign-in/social',
                    { provider, callbackURL, errorCallbackURL: callbackURL, disableRedirect: true },
                  );
                  const target = new URL(result.url);
                  if (
                    target.protocol !== 'https:' ||
                    !(provider === 'google'
                      ? target.hostname === 'accounts.google.com'
                      : target.hostname === 'discord.com')
                  )
                    throw new Error('The sign-in provider could not be opened.');
                  if (!link) {
                    clearToken();
                    localStorage.removeItem(profileKey());
                  }
                  location.assign(target.href);
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              {link ? 'Connect' : 'Continue with'} {provider === 'google' ? 'Google' : 'Discord'}
            </button>
          ))}
        {error && <p role="alert">{error}</p>}
      </div>
    </LocaleView>
  );
}
