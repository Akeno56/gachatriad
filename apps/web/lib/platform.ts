'use client';
import {
  serverURL,
  serverConfigured,
  sessionToken,
  saveToken,
  clearToken,
  profileKey,
} from './connection';
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}
const cooldowns = new Map<string, number>();
const unavailable = 'The game server is temporarily unavailable. Reconnecting…';
const rateLimited = 'Too many requests. Please wait a moment before trying again.';
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  if (!serverConfigured()) throw new Error('Connect to the host’s game server first.');
  const origin = serverURL();
  const bucket = `${origin}:${path.startsWith('/auth/') ? path.split('?')[0] : 'platform'}`;
  const remaining = (cooldowns.get(bucket) ?? 0) - Date.now();
  if (remaining > 0) throw new ApiError(rateLimited, 429, remaining);
  cooldowns.delete(bucket);
  const profile = localStorage.getItem(profileKey()),
    token = sessionToken();
  let response: Response;
  try {
    response = await fetch(`${origin}/api${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(profile && !path.startsWith('/auth') ? { 'x-profile-id': profile } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(method === 'GET' ? { signal: AbortSignal.timeout(15000) } : {}),
    });
  } catch (error) {
    if (method === 'GET') throw new ApiError(unavailable, 503);
    throw error;
  }
  let result;
  try {
    result = await response.json();
  } catch {
    // Keep the signed session when a gateway sends an empty/HTML restart response.
    if (response.status !== 429)
      throw new ApiError(unavailable, response.ok ? 503 : response.status);
  }
  const message = result?.error?.message || result?.error || result?.message;
  if (response.status === 429) {
    const header = response.headers.get('retry-after') ?? response.headers.get('x-retry-after');
    // Moderation and message-specific throttles also use 429; do not pause the battle for them.
    if (!header && message && !/rate limit|too many requests/i.test(message))
      throw new ApiError(message, 429);
    const seconds = header ? Number(header) : NaN;
    const delay = Number.isFinite(seconds)
      ? seconds * 1000
      : header
        ? Date.parse(header) - Date.now()
        : 10000;
    const retryAfterMs = Number.isFinite(delay) ? Math.max(1000, Math.min(120000, delay)) : 10000;
    cooldowns.set(bucket, Date.now() + retryAfterMs);
    throw new ApiError(rateLimited, 429, retryAfterMs);
  }
  if (response.ok) {
    const signed = response.headers.get('set-auth-token');
    if (signed) saveToken(signed);
    if (path === '/auth/sign-out') clearToken();
  }
  if (!response.ok)
    throw new ApiError(message || 'That action could not be completed.', response.status);
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
