import { it, expect } from 'vitest';
import { routeWithinBase } from './navigation';
it('uses an unprefixed root or route for Next navigation on GitHub Pages', () => {
  expect(routeWithinBase('/gachatriad', '/gachatriad')).toBe('/');
  expect(routeWithinBase('/gachatriad/', '/gachatriad')).toBe('/');
  expect(routeWithinBase('/gachatriad/cards/', '/gachatriad')).toBe('/cards/');
});
it('preserves standalone routing and leaves other same-origin sites outside the app', () => {
  expect(routeWithinBase('/', '')).toBe('/');
  expect(routeWithinBase('/decks/', '')).toBe('/decks/');
  expect(routeWithinBase('/gachatriad-other/', '/gachatriad')).toBeNull();
  expect(routeWithinBase('/another-project/', '/gachatriad')).toBeNull();
});
