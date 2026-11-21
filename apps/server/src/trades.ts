import { randomUUID } from 'node:crypto';
import { ALL_CARDS as CARDS } from '@gacha-triad/shared';
import type { MarketRequestView, TradeOfferView } from '@gacha-triad/shared/platform';
import type { ProfileIdentity } from './store';
import { Database, type Sql } from './database';
import { GameError } from './errors';
import { pruneDeck } from './inventory';
interface Offer {
  id: string;
  owner_id: string;
  offered_card: string;
  wanted_card: string | null;
  price: number | null;
  status: string;
  name: string;
  created_at: Date;
  market_request_id: string | null;
}
interface MarketRequest {
  id: string;
  profile_id: string;
  card_id: string;
  status: 'open' | 'fulfilled' | 'cancelled';
  name: string;
  created_at: Date;
}
const cards = new Map(CARDS.map((card) => [card.id, card]));
function offerView(t: Offer): TradeOfferView {
  return {
    id: t.id,
    ownerId: t.owner_id,
    owner: t.name,
    offered: cards.get(t.offered_card)!,
    wanted: t.wanted_card ? cards.get(t.wanted_card)! : null,
    price: t.price,
    createdAt: t.created_at.toISOString(),
  };
}
function salePrice(price: unknown): number {
  if (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 1 || price > 1000000)
    throw new GameError('Set a whole-number price between 1 and 1,000,000 Stellar Prisms.');
  return price;
}
export async function closeMarketRequests(
  sql: Sql,
  ids: string[],
  status: 'fulfilled' | 'cancelled',
) {
  if (!ids.length) return [];
  await sql("UPDATE market_requests SET status=$2 WHERE id=ANY($1::text[]) AND status='open'", [
    ids,
    status,
  ]);
  const released = await sql<Offer>(
    "UPDATE trade_offers SET status='cancelled',settled_at=now() WHERE market_request_id=ANY($1::text[]) AND status='open' RETURNING owner_id,offered_card",
    [ids],
  );
  for (const offer of released)
    await sql('UPDATE inventory SET reserved=reserved-1 WHERE profile_id=$1 AND card_id=$2', [
      offer.owner_id,
      offer.offered_card,
    ]);
  return released.map((offer) => offer.owner_id);
}
export class Trades {
  constructor(readonly db: Database) {}
  async list(cardId?: string): Promise<TradeOfferView[]> {
    return this.db.read(async (sql) =>
      (
        await sql<Offer>(
          "SELECT t.*,p.name FROM trade_offers t JOIN profiles p ON p.id=t.owner_id WHERE t.status='open' AND t.market_request_id IS NULL AND ($1::text IS NULL OR t.offered_card=$1) ORDER BY created_at DESC LIMIT 100",
          [cardId ?? null],
        )
      ).map(offerView),
    );
  }
  async create(p: ProfileIdentity, offered: string, wanted: string | null, price?: number) {
    if (!p.registered) throw new GameError('Register an account to post trade offers.', 403);
    if (
      !cards.has(offered) ||
      (wanted !== null && (price !== undefined || offered === wanted || !cards.has(wanted)))
    )
      throw new GameError('Choose two different valid cards.');
    const amount = wanted === null ? salePrice(price) : null;
    return this.db.tx((sql) => this.insertOffer(sql, p.id, offered, wanted, amount));
  }
  private async insertOffer(
    sql: Sql,
    ownerId: string,
    offered: string,
    wanted: string | null,
    price: number | null,
    requestId: string | null = null,
  ) {
    if (
      (await sql("SELECT id FROM trade_offers WHERE owner_id=$1 AND status='open'", [ownerId]))
        .length >= 5
    )
      throw new GameError('You can post up to five open offers.');
    if (
      !(
        await sql(
          'UPDATE inventory SET reserved=reserved+1 WHERE profile_id=$1 AND card_id=$2 AND quantity>reserved RETURNING card_id',
          [ownerId, offered],
        )
      ).length
    )
      throw new GameError('You need an available copy to offer.');
    const id = randomUUID();
    await sql(
      'INSERT INTO trade_offers(id,owner_id,offered_card,wanted_card,price,market_request_id) VALUES($1,$2,$3,$4,$5,$6)',
      [id, ownerId, offered, wanted, price, requestId],
    );
    return { id };
  }
  async requests(profileId: string): Promise<MarketRequestView[]> {
    return this.db.read(async (sql) => {
      const rows = await sql<MarketRequest>(
        `SELECT r.*,p.name FROM market_requests r JOIN profiles p ON p.id=r.profile_id WHERE r.status='open'
         ORDER BY (r.profile_id=$1 OR EXISTS(SELECT 1 FROM trade_offers t WHERE t.market_request_id=r.id AND t.owner_id=$1 AND t.status='open')) DESC,r.created_at DESC LIMIT 100`,
        [profileId],
      );
      if (!rows.length) return [];
      const offers = await sql<Offer>(
        `SELECT t.*,p.name FROM trade_offers t JOIN profiles p ON p.id=t.owner_id JOIN market_requests r ON r.id=t.market_request_id
         WHERE t.market_request_id=ANY($1::text[]) AND t.status='open' AND (r.profile_id=$2 OR t.owner_id=$2) ORDER BY t.price,t.created_at`,
        [rows.map((row) => row.id), profileId],
      );
      const responses = new Map<string, TradeOfferView[]>();
      for (const offer of offers) {
        const list = responses.get(offer.market_request_id!) ?? [];
        list.push(offerView(offer));
        responses.set(offer.market_request_id!, list);
      }
      return rows.map((row) => ({
        id: row.id,
        requesterId: row.profile_id,
        requester: row.name,
        cardId: row.card_id,
        createdAt: row.created_at.toISOString(),
        responses: responses.get(row.id) ?? [],
      }));
    });
  }
  async request(p: ProfileIdentity, cardId: unknown) {
    if (!p.registered) throw new GameError('Register an account to post market requests.', 403);
    if (typeof cardId !== 'string' || !cards.has(cardId))
      throw new GameError('Choose a valid card.');
    return this.db.tx(async (sql) => {
      const existing = await sql<{ id: string; card_id: string }>(
        "SELECT id,card_id FROM market_requests WHERE profile_id=$1 AND status='open'",
        [p.id],
      );
      const same = existing.find((row) => row.card_id === cardId);
      if (same) return { id: same.id };
      if (existing.length >= 5) throw new GameError('You can post up to five open requests.');
      if (
        !(
          await sql('SELECT 1 FROM card_wishlist WHERE profile_id=$1 AND card_id=$2', [
            p.id,
            cardId,
          ])
        ).length
      )
        throw new GameError('Add this card to your wishlist first.', 409);
      const id = randomUUID();
      await sql('INSERT INTO market_requests(id,profile_id,card_id) VALUES($1,$2,$3)', [
        id,
        p.id,
        cardId,
      ]);
      return { id };
    });
  }
  async respond(p: ProfileIdentity, id: string, price: unknown) {
    if (!p.registered) throw new GameError('Register an account to post trade offers.', 403);
    const amount = salePrice(price);
    return this.db.tx(async (sql) => {
      const [request] = await sql<MarketRequest>(
        "SELECT * FROM market_requests WHERE id=$1 AND status='open'",
        [id],
      );
      if (!request) throw new GameError('Request is no longer open.', 409);
      if (await this.sameAccount(sql, p.id, request.profile_id))
        throw new GameError('Choose a request from another account.');
      const existing = await sql<{ id: string; owner_id: string; price: number }>(
        "SELECT id,owner_id,price FROM trade_offers WHERE market_request_id=$1 AND status='open'",
        [id],
      );
      const own = existing.find((row) => row.owner_id === p.id);
      if (own?.price === amount) return { id: own.id };
      if (own) throw new GameError('Cancel your existing response before changing its price.', 409);
      if (existing.length >= 10)
        throw new GameError('This request already has ten responses.', 409);
      return this.insertOffer(sql, p.id, request.card_id, null, amount, id);
    });
  }
  async cancelRequest(p: ProfileIdentity, id: string) {
    return this.db.tx(async (sql) => {
      if (
        !(
          await sql(
            "SELECT 1 FROM market_requests WHERE id=$1 AND profile_id=$2 AND status='open'",
            [id, p.id],
          )
        ).length
      )
        throw new GameError('Request is no longer open.', 409);
      return closeMarketRequests(sql, [id], 'cancelled');
    });
  }
  private async sameAccount(sql: Sql, a: string, b: string) {
    return (
      a === b ||
      (
        await sql(
          'SELECT 1 FROM profile_accounts a JOIN profile_accounts b ON a.auth_user_id=b.auth_user_id WHERE a.profile_id=$1 AND b.profile_id=$2 AND a.auth_user_id IS NOT NULL',
          [a, b],
        )
      ).length > 0
    );
  }
  async cancel(p: ProfileIdentity, id: string) {
    await this.db.tx(async (sql) => {
      const [o] = await sql<Offer>(
        "UPDATE trade_offers SET status='cancelled',settled_at=now() WHERE id=$1 AND owner_id=$2 AND status='open' RETURNING *",
        [id, p.id],
      );
      if (!o) throw new GameError('Offer is no longer open.', 409);
      await sql('UPDATE inventory SET reserved=reserved-1 WHERE profile_id=$1 AND card_id=$2', [
        p.id,
        o.offered_card,
      ]);
    });
  }
  async accept(p: ProfileIdentity, id: string) {
    if (!p.registered) throw new GameError('Register an account to exchange cards.', 403);
    return this.db.tx(async (sql) => {
      const [o] = await sql<Offer>('SELECT * FROM trade_offers WHERE id=$1', [id]);
      if (!o || o.status !== 'open') throw new GameError('Offer is no longer open.', 409);
      if (
        o.market_request_id &&
        !(
          await sql(
            "SELECT 1 FROM market_requests WHERE id=$1 AND profile_id=$2 AND status='open'",
            [o.market_request_id, p.id],
          )
        ).length
      )
        throw new GameError('Offer is no longer open.', 409);
      if (await this.sameAccount(sql, o.owner_id, p.id))
        throw new GameError('Choose an offer from another account.');
      if (
        o.wanted_card &&
        !(
          await sql(
            'UPDATE inventory SET quantity=quantity-1 WHERE profile_id=$1 AND card_id=$2 AND quantity>reserved RETURNING card_id',
            [p.id, o.wanted_card],
          )
        ).length
      )
        throw new GameError('You need an available copy of the requested card.');
      if (o.price !== null) {
        if (
          !(
            await sql(
              'UPDATE profiles SET prisms=prisms-$2 WHERE id=$1 AND prisms>=$2 RETURNING id',
              [p.id, o.price],
            )
          ).length
        )
          throw new GameError('Not enough Stellar Prisms.');
        if (
          !(
            await sql(
              'UPDATE profiles SET prisms=prisms+$2 WHERE id=$1 AND prisms<=2147483647-$2 RETURNING id',
              [o.owner_id, o.price],
            )
          ).length
        )
          throw new GameError('The seller cannot receive this payment.', 409);
        for (const [who, delta] of [
          [p.id, -o.price],
          [o.owner_id, o.price],
        ])
          await sql(
            'INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,$4,$5)',
            [
              randomUUID(),
              who,
              delta,
              who === p.id ? 'market-purchase' : 'market-sale',
              `market:${id}`,
            ],
          );
      }
      if (
        !(
          await sql(
            'UPDATE inventory SET quantity=quantity-1,reserved=reserved-1 WHERE profile_id=$1 AND card_id=$2 AND reserved>0 RETURNING card_id',
            [o.owner_id, o.offered_card],
          )
        ).length
      )
        throw new GameError('The offered card is unavailable.', 409);
      for (const [who, card] of [
        [p.id, o.offered_card],
        [o.owner_id, o.wanted_card],
      ].filter((entry) => entry[1] !== null))
        await sql(
          'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=inventory.quantity+1',
          [who, card],
        );
      for (const [who, card, delta] of [
        [p.id, o.wanted_card, -1],
        [p.id, o.offered_card, 1],
        [o.owner_id, o.offered_card, -1],
        [o.owner_id, o.wanted_card, 1],
      ].filter((entry) => entry[1] !== null))
        await sql(
          "INSERT INTO inventory_ledger(id,profile_id,card_id,delta,kind,offer_id) VALUES($1,$2,$3,$4,'card-trade',$5)",
          [randomUUID(), who, card, delta, id],
        );
      await sql(
        "UPDATE trade_offers SET status='accepted',taker_id=$1,settled_at=now() WHERE id=$2",
        [p.id, id],
      );
      const released = o.market_request_id
        ? await closeMarketRequests(sql, [o.market_request_id], 'fulfilled')
        : [];
      for (const who of [p.id, o.owner_id]) await pruneDeck(sql, who);
      for (const who of [p.id, o.owner_id])
        await sql(
          "INSERT INTO achievement_unlocks(profile_id,achievement_id) SELECT $1,'collector' WHERE (SELECT count(DISTINCT coalesce(d.definition->>'baseCardId',i.card_id)) FROM inventory i JOIN card_definitions d ON d.id=i.card_id WHERE i.profile_id=$1 AND i.quantity>0)>=50 ON CONFLICT DO NOTHING",
          [who],
        );
      return [p.id, o.owner_id, ...released];
    });
  }
}
