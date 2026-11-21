import { ALL_CARDS } from '@gacha-triad/shared';
import { ACHIEVEMENTS, isRatedMode } from '@gacha-triad/shared/platform';
import {
  ASTRAL_REWARDS,
  PORTRAIT_FRAMES,
  PROFILE_BANNERS,
  type CustomizationView,
  type ProfileCustomization,
  type PortraitFrame,
  type ProfileBanner,
  type FeaturedMode,
} from '@gacha-triad/shared/customization';
import type { Database, Sql } from './database';
import { GameError } from './errors';
import { titlesFor } from './titles';
import { chatViolation } from './chat-filter';
import { astralRewardGames } from './season-rewards';
const cards = new Set(ALL_CARDS.map((c) => c.id));
interface Row {
  id: string;
  profile_revision: number;
  profile_bio: string;
  portrait_frame: PortraitFrame;
  profile_banner: ProfileBanner;
  featured_mode: FeaturedMode;
  showcase_cards: string[];
  showcase_achievements: string[];
  avatar_card: string | null;
  selected_title: string | null;
}
function list(value: unknown, label: string) {
  if (
    !Array.isArray(value) ||
    value.length > 3 ||
    value.some((v) => typeof v !== 'string') ||
    new Set(value).size !== value.length
  )
    throw new GameError(label);
  return value as string[];
}
export class ProfileCustomizations {
  constructor(readonly db: Database) {}
  private async viewIn(sql: Sql, id: string): Promise<CustomizationView> {
    const [p] = await sql<Row>('SELECT * FROM profiles WHERE id=$1', [id]);
    if (!p) throw new GameError('Player not found.', 404);
    const earned = await sql<{ achievement_id: string; unlocked_at: Date }>(
      'SELECT * FROM achievement_unlocks WHERE profile_id=$1 ORDER BY unlocked_at DESC',
      [id],
    );
    const unlocked = new Set(earned.map((a) => a.achievement_id));
    const astralGames = await astralRewardGames(sql, id);
    const owned = new Set(
      (
        await sql<{ card_id: string }>(
          'SELECT card_id FROM inventory WHERE profile_id=$1 AND quantity>0',
          [id],
        )
      ).map((c) => c.card_id),
    );
    return {
      settings: {
        revision: p.profile_revision,
        bio: p.profile_bio,
        frameId: p.portrait_frame,
        bannerId: p.profile_banner,
        featuredMode: p.featured_mode,
        featuredCards: p.showcase_cards.filter((id) => owned.has(id) && cards.has(id)),
        featuredAchievements: p.showcase_achievements.filter((id) => unlocked.has(id)),
        avatarCardId: p.avatar_card && owned.has(p.avatar_card) ? p.avatar_card : null,
        titleId: p.selected_title,
      },
      frames: PORTRAIT_FRAMES.map((f) => ({
        ...f,
        unlocked:
          f.id === ASTRAL_REWARDS.frame.id
            ? astralGames >= ASTRAL_REWARDS.frame.games
            : !f.achievementId || unlocked.has(f.achievementId),
      })),
      banners: PROFILE_BANNERS.map((banner) => ({
        ...banner,
        unlocked:
          banner.id !== ASTRAL_REWARDS.banner.id || astralGames >= ASTRAL_REWARDS.banner.games,
      })),
      titles: await titlesFor(sql, id),
      achievements: earned.flatMap((a) => {
        const def = ACHIEVEMENTS.find((d) => d.id === a.achievement_id);
        return def ? [{ id: def.id, name: def.name, unlockedAt: a.unlocked_at.toISOString() }] : [];
      }),
    };
  }
  view(id: string) {
    return this.db.read((sql) => this.viewIn(sql, id));
  }
  async save(id: string, input: Record<string, unknown>) {
    const { revision, bio, frameId, featuredMode, avatarCardId, titleId } = input;
    const banner = PROFILE_BANNERS.find(({ id }) => id === input.bannerId);
    if (input.bannerId !== undefined && !banner) throw new GameError('Choose a profile banner.');
    if (!Number.isSafeInteger(revision) || Number(revision) < 0)
      throw new GameError('Invalid profile revision.');
    if (
      typeof bio !== 'string' ||
      Array.from(bio.trim().normalize('NFC')).length > 160 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(bio)
    )
      throw new GameError('Use up to 160 characters for your bio.');
    if (chatViolation(bio)) throw new GameError('Profile text blocked by automatic moderation.');
    if (typeof featuredMode !== 'string' || !isRatedMode(featuredMode))
      throw new GameError('Choose a rated format.');
    if (avatarCardId !== null && typeof avatarCardId !== 'string')
      throw new GameError('Choose an owned card for your profile.');
    if (titleId !== null && typeof titleId !== 'string')
      throw new GameError('Choose an earned title.');
    const featuredCards = list(input.featuredCards, 'Choose up to three different owned cards.');
    const featuredAchievements = list(
      input.featuredAchievements,
      'Choose up to three different earned achievements.',
    );
    return this.db.tx(async (sql) => {
      const current = await this.viewIn(sql, id);
      if (current.settings.revision !== revision)
        throw new GameError('Your profile changed. Reload before saving.', 409);
      if (!current.frames.some((f) => f.id === frameId && f.unlocked))
        throw new GameError('Earn this frame before equipping it.');
      if (banner && !current.banners?.some((b) => b.id === banner.id && b.unlocked))
        throw new GameError('Earn this banner before equipping it.');
      if (titleId !== null && !current.titles.some((t) => t.id === titleId && t.unlocked))
        throw new GameError('Earn this title before equipping it.');
      const owned = new Set(
        (
          await sql<{ card_id: string }>(
            'SELECT card_id FROM inventory WHERE profile_id=$1 AND quantity>0',
            [id],
          )
        ).map((c) => c.card_id),
      );
      if (
        (avatarCardId !== null &&
          (!owned.has(avatarCardId as string) || !cards.has(avatarCardId as string))) ||
        featuredCards.some((c) => !owned.has(c) || !cards.has(c))
      )
        throw new GameError('Choose owned cards for your profile.');
      if (featuredAchievements.some((a) => !current.achievements.some((e) => e.id === a)))
        throw new GameError('Earn these achievements before featuring them.');
      const rows = await sql(
        `UPDATE profiles SET profile_bio=$1,portrait_frame=$2,featured_mode=$3,
         showcase_cards=$4::jsonb,showcase_achievements=$5::jsonb,avatar_card=$6,selected_title=$7,
         profile_banner=coalesce($8,profile_banner),profile_revision=profile_revision+1
         WHERE id=$9 AND profile_revision=$10 RETURNING id`,
        [
          bio.trim().normalize('NFC'),
          frameId,
          featuredMode,
          JSON.stringify(featuredCards),
          JSON.stringify(featuredAchievements),
          avatarCardId,
          titleId,
          banner?.id ?? null,
          id,
          revision,
        ],
      );
      if (!rows.length) throw new GameError('Your profile changed. Reload before saving.', 409);
      return this.viewIn(sql, id);
    });
  }
  async equipFrame(id: string, frameId: unknown, revision: unknown) {
    return this.db.tx(async (sql) => {
      const current = await this.viewIn(sql, id);
      if (current.settings.revision !== revision)
        throw new GameError('Your profile changed. Reload before saving.', 409);
      if (!current.frames.some((f) => f.id === frameId && f.unlocked))
        throw new GameError('Earn this frame before equipping it.');
      await sql(
        'UPDATE profiles SET portrait_frame=$1,profile_revision=profile_revision+1 WHERE id=$2',
        [frameId, id],
      );
      return this.viewIn(sql, id);
    });
  }
}
