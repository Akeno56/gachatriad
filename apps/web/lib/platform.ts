'use client';
import {
  serverURL,
  serverConfigured,
  sessionToken,
  saveToken,
  clearToken,
  profileKey,
} from './connection';
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  if (!serverConfigured()) throw new Error('Connect to the host’s game server first.');
  const profile = localStorage.getItem(profileKey()),
    token = sessionToken();
  const response = await fetch(`${serverURL()}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(profile && !path.startsWith('/auth') ? { 'x-profile-id': profile } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (response.ok) {
    const signed = response.headers.get('set-auth-token');
    if (signed) saveToken(signed);
    if (path === '/auth/sign-out') clearToken();
  }
  if (!response.ok)
    throw new Error(
      result.error?.message ||
        result.error ||
        result.message ||
        'That action could not be completed.',
    );
  return result;
}
let boot: Promise<void> | null = null;
export async function session() {
  if (!boot)
    boot = (async () => {
      if (!(await api('/auth/get-session'))) await api('/auth/sign-in/anonymous', {});
    })().catch((error) => {
      boot = null;
      throw error;
    });
  return boot;
}
export function resetSession() {
  boot = null;
}
