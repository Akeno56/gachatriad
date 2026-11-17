/** Router destinations omit the base path already present on rendered anchor URLs. */
export function routeWithinBase(pathname: string, basePath: string): string | null {
  if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return null;
  return pathname.slice(basePath.length) || '/';
}
