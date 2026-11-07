import { load } from 'cheerio';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
export const GAME_PATHS = {
  'star-rail': 'star-rail',
  zenless: 'zenless',
  'genshin-impact': 'genshin',
  'wuthering-waves': 'wuthering-waves',
  'arknights-endfield': 'endfield',
  'neverness-to-everness': 'nte',
};
export function localAssetPath(root, htmlFile, src) {
  if (!src || /^(https?:|data:|blob:|\/\/)/i.test(src)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(src.split('?')[0]);
  } catch {
    return null;
  }
  const path = resolve(dirname(htmlFile), decoded);
  const rel = relative(resolve(root), path);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return null;
  return path;
}
/** Reads only character links and their actual character image; never evaluates saved scripts. */
export function parseSavedPage(html, htmlFile, inputRoot) {
  const $ = load(html);
  const savedFrom = html.match(/saved from url=\(\d+\)(https?:\/\/[^\s>]+)/i)?.[1];
  const canonical = $('link[rel="canonical"]').attr('href') || savedFrom;
  if (!canonical) return { characters: [], warnings: ['No original URL found.'] };
  const pageUrl = new URL(canonical);
  const path = pageUrl.pathname.split('/').filter(Boolean);
  const universeId = GAME_PATHS[path[0]];
  if (!universeId || !['www.prydwen.gg', 'prydwen.gg'].includes(pageUrl.hostname))
    return { characters: [], warnings: ['Unsupported saved source.'] };
  const tierList = path[1] === 'tier-list';
  const characters = new Map();
  const warnings = [];
  $('a[href]').each((_, anchor) => {
    let url;
    try {
      url = new URL($(anchor).attr('href'), canonical);
    } catch {
      return;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (
      parts.length !== 3 ||
      parts[0] !== path[0] ||
      parts[1] !== 'characters' ||
      !/^[a-z0-9-]+$/.test(parts[2])
    )
      return;
    const image = $(anchor)
      .find('img[alt]')
      .filter((_, el) => {
        const classes = $(el).attr('class') || '';
        const src = $(el).attr('src') || '';
        return (
          classes.includes('character-image') ||
          (classes.includes('disable-transition') &&
            !/ele_|element_|style_|weapon_|class_/.test(src))
        );
      })
      .first();
    if (!image.length) return;
    const name = image.attr('alt')?.trim();
    if (!name) return;
    const src = image.attr('src');
    const localFile = localAssetPath(inputRoot, htmlFile, src);
    let originalUrl = image.attr('data-original-src') || image.attr('data-src') || null;
    if (src?.startsWith('https://cdn.prydwen.gg/')) originalUrl = src;
    if (originalUrl && !originalUrl.startsWith('https://cdn.prydwen.gg/')) originalUrl = null;
    const kind = tierList || src?.includes('_icon.') ? 'icon' : 'portrait';
    const key = `${universeId}:${parts[2]}`;
    const existing = characters.get(key) || {
      id: key,
      slug: parts[2],
      universeId,
      name,
      sourcePage: `https://www.prydwen.gg/${parts[0]}/characters/${parts[2]}`,
      assets: [],
      sourceRarity: null,
      sourceElement: null,
      sourceRole: null,
      tierPlacements: [],
    };
    if (!tierList) {
      const classes = [
        $(anchor).attr('class'),
        $(anchor).find('.avatar').first().attr('class'),
      ].join(' ');
      existing.sourceRarity ||= classes.match(/\brarity-([0-9AS]+)\b/)?.[1] || null;
      const elementImage = $(anchor)
        .find('img')
        .filter((_, el) => /(?:ele_|element_)/.test($(el).attr('src') || ''))
        .first();
      const elementFile = elementImage.attr('src')?.match(/(?:ele_|element_)([a-z-]+)\./i)?.[1];
      existing.sourceElement ||=
        elementImage
          .attr('alt')
          ?.replace(name, '')
          .replace(/\s+element$/i, '')
          .trim() ||
        elementFile ||
        null;
      const roleImage = $(anchor).find('.class img,.role img,img.weapon').first();
      existing.sourceRole ||=
        roleImage
          .attr('alt')
          ?.replace(name, '')
          .replace(/\s+style$/i, '')
          .trim() || null;
    } else {
      const tier = $(anchor).closest('.custom-tier').find('> .tier-rating').first().text().trim();
      const role = $(anchor).closest('.custom-tier-container').children().first().text().trim();
      const conditions = $(anchor).text().replace(name, '').replace(/\s+/g, ' ').trim();
      const assumptions = $(anchor)
        .find('.eidolon,.cinema,.sequence,.constellation,.genshin-constellation-badge')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean)
        .join(' / ');
      const context =
        $('h2')
          .map((_, el) => $(el).text().trim())
          .get()
          .find((t) =>
            /Overall|Tower of Adversity|Shiyu|Deadly Assault|Memory of Chaos|Pure Fiction|Apocalyptic Shadow/i.test(
              t,
            ),
          ) ||
        $('h2').first().text().trim() ||
        'Saved tier-list view';
      if (/^T\d+(?:\.\d+)?$/.test(tier)) {
        const placement = { tier, role, assumptions, conditions, context, sourcePage: canonical };
        if (!existing.tierPlacements.some((p) => JSON.stringify(p) === JSON.stringify(placement)))
          existing.tierPlacements.push(placement);
      }
    }
    const candidate = {
      type: kind,
      localFile,
      sourceUrl: originalUrl,
      savedPage: htmlFile,
      savedReference: src,
    };
    if (!existing.assets.some((a) => a.type === kind && a.localFile === localFile))
      existing.assets.push(candidate);
    characters.set(key, existing);
    if (!localFile) warnings.push(`${name}: image is not saved locally (${src}).`);
  });
  return { characters: [...characters.values()], warnings };
}
