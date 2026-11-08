import { it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseHideoutPage } from './hideout-pages.mjs';
it('extracts Epic Seven IDs, rarity, affinity and local images without evaluating scripts', () => {
  const root = resolve('saved'),
    html = `<link rel="canonical" href="https://www.hideoutgacha.com/games/epic-seven/characters"><script>throw Error('never execute')</script><a data-card="c2124" href="/games/epic-seven/characters/boss-arunka"><picture><source srcset="/images/1x/192x288/listing/epic-seven/boss-arunka.webp"><img src="./files/boss.webp"></picture><span class="CharacterCards_icons__abc"><img alt="Light"><img alt="Knight"></span><span class="CharacterCards_name__abc">Boss Arunka</span><span style="width:calc(5 * var(--star))"></span></a>`;
  const parsed = parseHideoutPage(html, resolve(root, 'page.html'), root).characters[0];
  expect(parsed).toMatchObject({
    sourceId: 'c2124',
    sourceRarity: '5',
    sourceElement: 'Light',
    sourceRole: 'Knight',
  });
  expect(parsed.assetUrls.portrait).toMatch(/c2124_art.webp$/);
});
it('preserves Star Savior forms and tier context while rejecting unsafe local paths', () => {
  const root = resolve('saved'),
    html = `<link rel="canonical" href="https://www.hideoutgacha.com/games/star-savior/character-tier-list"><section data-tier="SS"><a data-rid="bunnygirl-charlotte" href="/games/star-savior/characters/sun/bunnygirl-charlotte"><picture><source srcset="/images/1x/112x152/star-savior/portraits/Bunnygirl%20Charlotte.webp"><img src="../../outside.webp"></picture><img alt="Sun"><span class="TierLadder_name__abc">Charlotte (Bunnygirl)</span></a></section>`;
  const parsed = parseHideoutPage(html, resolve(root, 'page.html'), root).characters[0];
  expect(parsed.assetUrls.portrait).toMatch(/Bunnygirl%20Charlotte.webp$/);
  expect(parsed.tierPlacements[0].rawTier).toBe('SS');
  expect(parsed.assets[0].localFile).toBeNull();
});
