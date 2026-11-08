/** Reads inert saved HTML and validates image bytes; never executes page scripts. */
import { readFile, writeFile, readdir, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { parseHideoutPage } from './hideout-pages.mjs';
import { writeClientIndex } from './client-index.mjs';
import { proposeBalance } from '../../packages/balance/src/index.ts';
import { load } from 'cheerio';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  input = resolve(root, 'hideoutGachaData'),
  out = resolve(root, 'data/expansions/gacha-universe-ii');
const promote = process.argv.includes('--promote'),
  inspect = process.argv.includes('--inspect');
const byId = new Map(),
  snapshots = [];
for (const file of (await readdir(input)).filter((name) => name.endsWith('.html')).sort()) {
  const bytes = await readFile(resolve(input, file)),
    parsed = parseHideoutPage(bytes.toString('utf8'), resolve(input, file), input);
  snapshots.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
  for (const entry of parsed.characters) {
    const current = byId.get(entry.id);
    if (!current) byId.set(entry.id, entry);
    else {
      for (const key of ['sourceRarity', 'sourceElement', 'sourceRole'])
        current[key] ||= entry[key];
      for (const placement of entry.tierPlacements)
        if (
          !current.tierPlacements.some(
            (p) => p.rawTier === placement.rawTier && p.context === placement.context,
          )
        )
          current.tierPlacements.push(placement);
      for (const asset of entry.assets)
        if (!current.assets.some((a) => a.type === asset.type && a.localFile === asset.localFile))
          current.assets.push(asset);
      if (entry.tierPlacements.length) current.assetUrls = entry.assetUrls;
    }
  }
}
const characters = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
const config = JSON.parse(await readFile(resolve(root, 'data/balance/config.json'), 'utf8'));
config.version = 'draft-v2';
config.sourceRarities['epic-seven'] = { 3: 0, 4: 0.5, 5: 1 };
config.sourceRarities['star-savior'] = { SR: 0, SSR: 1 };
for (const [source, element] of Object.entries({
  light: 'holy',
  dark: 'poison',
  sun: 'fire',
  moon: 'ice',
  star: 'holy',
  order: 'holy',
  chaos: 'poison',
}))
  config.elements[source] = {
    element,
    review: false,
    note: 'User-approved element mapping for release II.',
  };
const tierMap = {
  'epic-seven': { SSS: 'T0', SS: 'T0.5', S: 'T1', A: 'T2', B: 'T3', C: 'T4', D: 'T5' },
  'star-savior': { SS: 'T0', S: 'T1', A: 'T2', B: 'T3', C: 'T4' },
};
for (const character of characters) {
  character.tierPlacements = character.tierPlacements.map((p) => ({
    ...p,
    tier: tierMap[character.universeId][p.rawTier] ?? p.rawTier,
    conditions:
      character.universeId === 'epic-seven'
        ? 'RTA pick-frequency proxy, not a direct strength score.'
        : 'Saved default PvE view.',
  }));
  character.gameplayStatus = 'unbalanced-not-playable';
}
const sourceSnapshot = createHash('sha256').update(JSON.stringify(snapshots)).digest('hex'),
  modelDigest = createHash('sha256').update(JSON.stringify(config)).digest('hex');
const proposals = characters.map((character) => ({
  ...proposeBalance(character, config),
  sourceRarity: character.sourceRarity,
  sourceElement: character.sourceElement,
  tierPlacements: character.tierPlacements,
  sourcePage: character.sourcePage,
  sourceSnapshot,
  modelDigest,
}));
if (inspect) {
  console.log(
    JSON.stringify({
      characters: characters.length,
      scored: proposals.filter((p) => p.stats).length,
      byGame: Object.fromEntries(
        ['epic-seven', 'star-savior'].map((game) => [
          game,
          characters.filter((c) => c.universeId === game).length,
        ]),
      ),
      tiers: Object.fromEntries(
        ['epic-seven', 'star-savior'].map((game) => [
          game,
          [
            ...new Set(
              characters
                .filter((c) => c.universeId === game)
                .flatMap((c) => c.tierPlacements.map((p) => p.rawTier)),
            ),
          ],
        ]),
      ),
    }),
  );
  process.exit(0);
}
await mkdir(out, { recursive: true });
let previous = [];
try {
  previous = JSON.parse(await readFile(resolve(out, 'asset-manifest.json'), 'utf8'));
} catch {}
const assets = [],
  failures = [];
const tasks = characters.flatMap((character) =>
  ['portrait', 'icon', 'listing'].map((type) => ({ character, type })),
);
let next = 0,
  completed = 0;
async function worker() {
  while (next < tasks.length) {
    const { character, type } = tasks[next++];
    const destination = resolve(
        root,
        `apps/web/public/assets/characters/${character.universeId}/${character.characterId}/${type}.webp`,
      ),
      localPath =
        '/' + relative(resolve(root, 'apps/web/public'), destination).replaceAll('\\', '/');
    let sourceUrl = character.assetUrls[type];
    try {
      const cached = previous.find(
        (asset) =>
          asset.characterId === character.characterId &&
          asset.universeId === character.universeId &&
          asset.assetType === type,
      );
      if (cached) {
        try {
          await access(destination);
          assets.push(cached);
          completed++;
          continue;
        } catch {}
      }
      let bytes;
      const saved = character.assets.find((asset) => asset.type === type && asset.localFile);
      if (saved)
        try {
          bytes = await readFile(saved.localFile);
        } catch {}
      if (!bytes) {
        let response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000) });
        if (!response.ok && (type === 'portrait' || type === 'icon')) {
          const page = await fetch(character.sourcePage, { signal: AbortSignal.timeout(20000) });
          const html = await page.text();
          const $ = load(html);
          let fallback;
          if (character.universeId === 'epic-seven')
            fallback = `/images/epic-seven/characters/${character.sourceId}.webp`;
          else if (type === 'portrait')
            fallback = $('img')
              .map((_, el) => $(el).attr('src'))
              .get()
              .find((src) => /\/images\/star-savior\/(?:banners|illusts)\/hero\//.test(src));
          else {
            const decoded = html.replaceAll('\\"', '"');
            fallback = decoded.match(
              /"icon":"(\/images\/star-savior\/char-icons\/[^"<>]+\.webp)"/,
            )?.[1];
          }
          if (fallback) {
            sourceUrl = new URL(fallback, 'https://www.hideoutgacha.com').href;
            response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000) });
          }
        }
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        if (!response.headers.get('content-type')?.startsWith('image/'))
          throw Error('Not an image response.');
        bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 20 * 1024 * 1024) throw Error('Image exceeds size limit.');
      }
      const meta = await sharp(bytes).metadata();
      if (!meta.width || !meta.height) throw Error('Invalid image dimensions.');
      await mkdir(dirname(destination), { recursive: true });
      const image = await sharp(bytes)
        .rotate()
        .resize({
          width: type === 'portrait' ? 640 : 256,
          height: type === 'portrait' ? 960 : type === 'listing' ? 384 : 256,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: type === 'portrait' ? 88 : 85 })
        .toBuffer({ resolveWithObject: true });
      await writeFile(destination, image.data);
      assets.push({
        assetId: `${character.universeId}-${character.characterId}-${type}-v1`,
        characterId: character.characterId,
        universeId: character.universeId,
        assetType: type,
        localPath,
        source: 'Hideout Guides (user-saved page and supplied artwork URLs)',
        sourcePage: character.sourcePage,
        sourceUrl,
        savedReference: saved?.localFile
          ? relative(root, saved.localFile).replaceAll('\\', '/')
          : null,
        originalWidth: meta.width,
        originalHeight: meta.height,
        width: image.info.width,
        height: image.info.height,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        outputSha256: createHash('sha256').update(image.data).digest('hex'),
        rightsReview: 'development-only-unreviewed',
        publicDistributionApproved: false,
        version: 1,
      });
    } catch (error) {
      failures.push({ id: character.id, type, sourceUrl, error: error.message });
    }
    completed++;
    if (completed % 75 === 0) {
      await writeFile(resolve(out, 'asset-manifest.json'), JSON.stringify(assets, null, 2) + '\n');
      console.log(`Validated ${completed}/${tasks.length} images; failures: ${failures.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
await Promise.all([worker(), worker(), worker()]);
assets.sort((a, b) =>
  `${a.universeId}:${a.characterId}:${a.assetType}`.localeCompare(
    `${b.universeId}:${b.characterId}:${b.assetType}`,
  ),
);
for (const character of characters) {
  character.assets = assets
    .filter(
      (asset) =>
        asset.universeId === character.universeId && asset.characterId === character.characterId,
    )
    .map((asset) => ({ type: asset.assetType, localPath: asset.localPath }));
}
await writeFile(resolve(out, 'characters.json'), JSON.stringify(characters, null, 2) + '\n');
await writeFile(resolve(out, 'proposals.json'), JSON.stringify(proposals, null, 2) + '\n');
await writeFile(resolve(out, 'balance-model.json'), JSON.stringify(config, null, 2) + '\n');
await writeFile(resolve(out, 'asset-manifest.json'), JSON.stringify(assets, null, 2) + '\n');
const csvCell = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const header = [
  'id',
  'name',
  'sourceRarity',
  'sourceElement',
  'tiers',
  'context',
  'powerIndex',
  'triadRarity',
  'statBudget',
  'top',
  'right',
  'bottom',
  'left',
  'element',
  'status',
];
const rows = proposals.map((p) => [
  p.id,
  p.name,
  p.sourceRarity,
  p.sourceElement,
  p.tierPlacements.map((t) => t.rawTier).join('/'),
  p.tierPlacements.map((t) => t.context).join('/'),
  p.powerIndex,
  p.triadRarity,
  p.statBudget,
  ...(p.stats ?? [null, null, null, null]),
  p.element,
  p.status,
]);
await writeFile(
  resolve(out, 'proposals.csv'),
  '\ufeff' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'),
);
const missingScoredArt = proposals.filter(
  (p) =>
    p.stats &&
    !assets.some((a) => a.assetType === 'portrait' && `${a.universeId}:${a.characterId}` === p.id),
);
const report = {
  sourceSnapshot,
  modelDigest,
  snapshots,
  characters: characters.length,
  scored: proposals.filter((p) => p.stats).length,
  unscored: proposals.filter((p) => !p.stats).map((p) => p.id),
  images: assets.length,
  failures,
  missingScoredArt: missingScoredArt.map((p) => p.id),
  promoted: false,
};
await writeFile(resolve(out, 'import-report.json'), JSON.stringify(report, null, 2) + '\n');
if (promote) {
  if (missingScoredArt.length)
    throw Error(
      `${missingScoredArt.length} scored characters lack full artwork; see import report.`,
    );
  const merge = async (file, records, key) => {
    let current = [];
    try {
      current = JSON.parse(await readFile(resolve(root, file), 'utf8'));
    } catch {}
    const entries = new Map(current.map((record) => [key(record), record]));
    for (const record of records) entries.set(key(record), record);
    const result = [...entries.values()];
    await writeFile(resolve(root, file), JSON.stringify(result, null, 2) + '\n');
    return result;
  };
  const catalog = await merge('data/characters/catalog.json', characters, (c) => c.id);
  const manifest = await merge(
    'data/assets/manifest.json',
    assets,
    (a) => `${a.universeId}:${a.characterId}:${a.assetType}`,
  );
  const newCards = proposals
    .filter((p) => p.stats && p.triadRarity)
    .map((p) => ({
      id: p.id,
      characterId: byId.get(p.id).characterId,
      universeId: p.universeId,
      name: p.name,
      rarity: p.triadRarity,
      stats: p.stats,
      ...(p.element ? { element: p.element } : {}),
      set: 'gacha-universe-ii',
      enabled: true,
      artworkId: p.id,
      balanceVersion: 'approved-v2',
    }));
  const cards = await merge('data/cards/catalog.json', newCards, (c) => c.id);
  await merge('data/balance/proposals.json', proposals, (p) => p.id);
  await writeFile(
    resolve(root, 'data/balance/config.json'),
    JSON.stringify(config, null, 2) + '\n',
  );
  await writeClientIndex(root, manifest, catalog);
  const universes = JSON.parse(await readFile(resolve(root, 'data/universes/index.json'), 'utf8'));
  for (const game of [
    {
      id: 'epic-seven',
      name: 'Epic Seven',
      shortName: 'Epic Seven',
      sigil: 'VII',
      color: '#c5a58d',
    },
    {
      id: 'star-savior',
      name: 'Star Savior',
      shortName: 'Star Savior',
      sigil: '✶',
      color: '#d2a8c9',
    },
  ])
    if (!universes.some((u) => u.id === game.id)) universes.push(game);
  await writeFile(
    resolve(root, 'data/universes/index.json'),
    JSON.stringify(universes, null, 2) + '\n',
  );
  await writeFile(
    resolve(root, 'data/cards/release.json'),
    JSON.stringify(
      {
        version: 'approved-v2',
        approvedOn: new Date().toISOString().slice(0, 10),
        cards: cards.length,
        newCards: newCards.length,
        sourceModel: config.version,
        sourceSnapshot,
        modelDigest,
        excluded: report.unscored,
        approval:
          'User explicitly requested importing, calculating and releasing Epic Seven and Star Savior in Booster II; NTE and Endfield move to II. User approved cosmic element mappings.',
        tierContext:
          'Epic Seven default PvP tiers use RTA pick frequency; retain as a contextual proxy rather than a direct strength score.',
      },
      null,
      2,
    ) + '\n',
  );
  report.promoted = true;
  await writeFile(resolve(out, 'import-report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(
  JSON.stringify({
    characters: report.characters,
    scored: report.scored,
    unscored: report.unscored.length,
    images: assets.length,
    failures: failures.length,
    promoted: report.promoted,
  }),
);
