import { expect, it } from 'vitest';
import { resolve, join } from 'node:path';
import { localAssetPath, parseSavedPage } from './saved-pages.mjs';
const input = resolve('fixture-exports');
const file = join(input, 'HSR.html');
const fixture = (body, page = 'star-rail/characters') =>
  `<!-- saved from url=(0043)https://www.prydwen.gg/${page} -->${body}`;
it('preserves forms as distinct IDs and reads only character artwork, without executing saved scripts', () => {
  const html = fixture(
    `<script>throw new Error('must never run')</script><a href="https://www.prydwen.gg/star-rail/characters/march-7th"><div class="avatar"><img class="disable-transition" alt="March 7th" src="./saved_files/march-7th_card.webp"><img alt="Ice" src="./saved_files/ele_ice.webp"></div></a><a href="https://www.prydwen.gg/star-rail/characters/march-7th-swordmaster"><img class="disable-transition" alt="March 7th (Hunt)" src="./saved_files/march-7th-swordmaster_card.webp"></a>`,
  );
  const result = parseSavedPage(html, file, input);
  expect(result.characters.map((c) => c.id)).toEqual([
    'star-rail:march-7th',
    'star-rail:march-7th-swordmaster',
  ]);
  expect(result.characters[0].assets).toHaveLength(1);
  expect(result.characters[0].assets[0].sourceUrl).toBeNull();
  expect(result.characters[0].assets[0].localFile).toBe(
    join(input, 'saved_files', 'march-7th_card.webp'),
  );
});
it('uses square icons on tier pages and supports the observed Genshin and NTE markup', () => {
  for (const game of ['genshin-impact', 'neverness-to-everness']) {
    const html = fixture(
      `<a class="pw-card" href="https://www.prydwen.gg/${game}/characters/test-form"><img class="character-image" alt="Test Form" src="./images/test.webp"></a>`,
      `${game}/tier-list`,
    );
    const c = parseSavedPage(html, file, input).characters[0];
    expect(c.assets[0].type).toBe('icon');
    expect(c.universeId).toBe(game === 'genshin-impact' ? 'genshin' : 'nte');
  }
});
it('rejects local traversal and remote URLs as local files, and decodes saved relative filenames', () => {
  expect(localAssetPath(input, file, '../../outside.webp')).toBeNull();
  expect(localAssetPath(input, file, 'https://example.com/card.webp')).toBeNull();
  expect(localAssetPath(input, file, './a%20b_files/card.webp')).toBe(
    join(input, 'a b_files', 'card.webp'),
  );
});
it('deduplicates repeated tier-list instances without merging different game characters', () => {
  const a = `<a href="https://www.prydwen.gg/star-rail/characters/acheron"><img class="disable-transition" alt="Acheron" src="./files/acheron_icon.webp"></a>`;
  expect(
    parseSavedPage(fixture(a + a, 'star-rail/tier-list'), file, input).characters,
  ).toHaveLength(1);
});
it('extracts original rarity and element separately from a conditional tier placement', () => {
  const directory = fixture(
    `<a href="https://www.prydwen.gg/star-rail/characters/sampo"><div class="avatar rarity-4"><img class="disable-transition" alt="Sampo" src="./files/sampo_card.webp"><span class="floating-element"><img alt="Wind" src="./files/ele_wind.webp"></span></div></a>`,
  );
  expect(parseSavedPage(directory, file, input).characters[0]).toMatchObject({
    sourceRarity: '4',
    sourceElement: 'Wind',
    tierPlacements: [],
  });
  const tier = fixture(
    `<div class="custom-tier"><div class="tier-rating"><span>T5</span></div><div class="custom-tier-container"><span>DPS</span><a href="https://www.prydwen.gg/star-rail/characters/sampo"><img class="disable-transition" alt="Sampo" src="./files/sampo_icon.webp"><span class="eidolon">E6</span></a></div></div>`,
    'star-rail/tier-list',
  );
  expect(parseSavedPage(tier, file, input).characters[0].tierPlacements[0]).toMatchObject({
    tier: 'T5',
    role: 'DPS',
    assumptions: 'E6',
  });
});
