import { load } from 'cheerio';
import { localAssetPath } from './saved-pages.mjs';
const HOST = 'https://www.hideoutgacha.com';
export function parseHideoutPage(html, file, inputRoot) {
  const $ = load(html),
    canonical =
      $('link[rel="canonical"]').attr('href') ||
      html.match(/saved from url=\(\d+\)(https?:\/\/[^\s>]+)/)?.[1];
  if (!canonical) return { characters: [], warnings: ['No canonical source URL.'] };
  const page = new URL(canonical);
  if (page.origin !== HOST || !/^\/games\/(epic-seven|star-savior)\//.test(page.pathname))
    return { characters: [], warnings: ['Unsupported source.'] };
  const game = page.pathname.split('/')[2],
    characters = [];
  $('a[data-card],a[data-rid]').each((_, element) => {
    const anchor = $(element),
      href = anchor.attr('href');
    if (!href) return;
    const url = new URL(href, HOST),
      parts = url.pathname.split('/').filter(Boolean),
      slug = parts.at(-1);
    if (
      url.origin !== HOST ||
      parts[0] !== 'games' ||
      parts[1] !== game ||
      parts[2] !== 'characters' ||
      !/^[a-z0-9-]+$/.test(slug)
    )
      return;
    const sourceId = anchor.attr('data-card') || anchor.attr('data-rid');
    if (!/^[a-z0-9_-]+$/i.test(sourceId)) return;
    const tier = anchor.closest('[data-tier]').attr('data-tier') ?? null;
    const name = anchor.find('[class*="_name__"]').first().text().trim();
    if (!name) return;
    const image = anchor.find('picture img').first(),
      source = anchor
        .find('picture source')
        .first()
        .attr('srcset')
        ?.split(',')[0]
        .trim()
        .split(/\s/)[0];
    const icons = anchor
      .find('[class*="_icons__"] img')
      .map((_, image) => $(image).attr('alt'))
      .get();
    const elementName =
      icons[0] ||
      anchor
        .find('img[alt]')
        .map((_, image) => $(image).attr('alt'))
        .get()
        .find((s) =>
          [
            'Fire',
            'Ice',
            'Earth',
            'Light',
            'Dark',
            'Sun',
            'Moon',
            'Star',
            'Order',
            'Chaos',
          ].includes(s),
        ) ||
      null;
    const stars = anchor
      .find('[style]')
      .map((_, node) => $(node).attr('style'))
      .get()
      .map((style) => style.match(/(?:calc\(\s*|--s:\s*)([345])(?:\s*\*|\s*;)/)?.[1])
      .find(Boolean);
    const rarity =
      game === 'epic-seven'
        ? (stars ?? null)
        : anchor.find('[class*="_badge__"]').first().text().trim() || null;
    const imageUrl = source ? new URL(source, HOST).href : null;
    let hero;
    if (game === 'star-savior' && imageUrl?.includes('/portraits/'))
      hero = decodeURIComponent(new URL(imageUrl).pathname.split('/').at(-1)).replace(
        /\.webp$/,
        '',
      );
    if (!hero && game === 'star-savior') hero = name.replace(/^(.+) \((.+)\)$/, '$2 $1');
    const portraitUrl =
      game === 'epic-seven'
        ? `${HOST}/images/epic-seven/characters/${sourceId}_art.webp`
        : `${HOST}/images/star-savior/banners/hero/${encodeURIComponent(hero)}.webp`;
    const iconUrl =
      game === 'epic-seven'
        ? `${HOST}/images/1x/80x80/epic-seven/characters/small/${sourceId}.webp`
        : `${HOST}/images/1x/112x152/star-savior/portraits/${encodeURIComponent(hero)}.webp`;
    const listingUrl = `${HOST}/images/1x/192x288/listing/${game}/${slug}.webp`;
    characters.push({
      id: `${game}:${slug}`,
      characterId: slug,
      slug,
      universeId: game,
      sourceId,
      name,
      sourcePage: url.href,
      sourceRarity: rarity,
      sourceElement: elementName,
      sourceRole: icons[1] || null,
      tierPlacements: tier
        ? [
            {
              rawTier: tier,
              sourcePage: canonical,
              context:
                game === 'epic-seven'
                  ? 'PvP · RTA pick frequency · default saved view'
                  : 'PvE · default saved view',
              role: anchor
                .closest('[class*="_cell__"]')
                .find('[class*="_cellHead__"]')
                .first()
                .text()
                .trim(),
              pickCountDisplay: anchor.find('[class*="_pick__"]').text().trim() || null,
              displayedRate: anchor.find('[class*="_share__"]').text().trim() || null,
            },
          ]
        : [],
      assets: [
        {
          type: tier ? 'icon' : 'listing',
          localFile: localAssetPath(inputRoot, file, image.attr('src')),
          sourceUrl: imageUrl,
        },
      ],
      assetUrls: { portrait: portraitUrl, icon: iconUrl, listing: listingUrl },
    });
  });
  return { characters, warnings: [] };
}
