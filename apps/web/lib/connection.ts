export const APP_BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const STATIC_BUILD = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';
export const assetPath = (path: string) => `${APP_BASE}${path}`;
export const appPath = assetPath;
export function serverURL() {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_API_URL || '';
  return localStorage.getItem('triad-server') || process.env.NEXT_PUBLIC_API_URL || '';
}
export function serverConfigured() {
  return !STATIC_BUILD || !!serverURL();
}
export function normalizeServerURL(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('Use an HTTPS server address, or HTTP on localhost for local testing.');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Use just the server address, without a path, password or query.');
  return url.origin;
}
export const profileKey = () => (serverURL() ? `triad-profile:${serverURL()}` : 'triad-profile');
const tokenKey = () => `triad-session:${serverURL()}`;
export function sessionToken() {
  return serverURL() ? localStorage.getItem(tokenKey()) || '' : '';
}
export function saveToken(token: string) {
  if (serverURL()) localStorage.setItem(tokenKey(), token);
}
export function clearToken() {
  localStorage.removeItem(tokenKey());
}
export function socketURL() {
  return (
    serverURL() ||
    process.env.NEXT_PUBLIC_SERVER_URL ||
    `${location.protocol}//${location.hostname}:3001`
  );
}
