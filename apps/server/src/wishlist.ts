import { ALL_CARDS } from '@gacha-triad/shared';
import type { WishlistEntry } from '@gacha-triad/shared/platform';
import type { Database } from './database';
import { GameError } from './errors';

const cardIds = new Set(ALL_CARDS.map((card) => card.id));
export class Wishlist {
  constructor(readonly db: Database) {}

  list(profileId: string): Promise<WishlistEntry[]> {
    return this.db.read((sql) =>
      sql<WishlistEntry>(
        `SELECT w.card_id AS "cardId",r.id AS "requestId",
          (SELECT count(*)::int FROM trade_offers t WHERE t.offered_card=w.card_id AND t.status='open' AND t.market_request_id IS NULL AND t.owner_id<>$1) listings
         FROM card_wishlist w LEFT JOIN market_requests r ON r.profile_id=w.profile_id AND r.card_id=w.card_id AND r.status='open'
         WHERE w.profile_id=$1 ORDER BY w.created_at DESC,w.card_id`,
        [profileId],
      ),
    );
  }

  async save(profileId: string, cardId: unknown, saved: unknown) {
    if (typeof cardId !== 'string' || !cardIds.has(cardId) || typeof saved !== 'boolean')
      throw new GameError('Choose a valid card and wishlist action.');
    await this.db.tx((sql) =>
      saved
        ? sql(
            'INSERT INTO card_wishlist(profile_id,card_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [profileId, cardId],
          )
        : sql('DELETE FROM card_wishlist WHERE profile_id=$1 AND card_id=$2', [profileId, cardId]),
    );
    return { cardId, saved };
  }
}
