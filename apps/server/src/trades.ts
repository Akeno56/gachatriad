import { randomUUID } from 'node:crypto';
import { ALL_CARDS as CARDS } from '@gacha-triad/shared';
import type { TradeOfferView } from '@gacha-triad/shared/platform';
import type { ProfileIdentity } from './store';
import { Database } from './database';
import { GameError } from './store';
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
}
export class Trades {
  constructor(readonly db: Database) {}
  async list(): Promise<TradeOfferView[]> {
    return this.db.read(async (sql) =>
      (
        await sql<Offer>(
          "SELECT t.*,p.name FROM trade_offers t JOIN profiles p ON p.id=t.owner_id WHERE t.status='open' ORDER BY created_at DESC LIMIT 100",
        )
      ).map((t) => ({
        id: t.id,
        ownerId: t.owner_id,
        owner: t.name,
        offered: CARDS.find((c) => c.id === t.offered_card)!,
        wanted: t.wanted_card ? CARDS.find((c) => c.id === t.wanted_card)! : null,
        price: t.price,
        createdAt: t.created_at.toISOString(),
      })),
    );
  }
  async create(p: ProfileIdentity, offered: string, wanted: string | null, price?: number) {
    if (!p.registered) throw new GameError('Register an account to post trade offers.', 403);
    if (
      !CARDS.some((c) => c.id === offered) ||
      (wanted !== null &&
        (price !== undefined || offered === wanted || !CARDS.some((c) => c.id === wanted)))
    )
      throw new GameError('Choose two different valid cards.');
    if (
      wanted === null &&
      (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 1 || price > 1000000)
    )
      throw new GameError('Set a whole-number price between 1 and 1,000,000 Stellar Prisms.');
    return this.db.tx(async (sql) => {
      if (
        (await sql("SELECT id FROM trade_offers WHERE owner_id=$1 AND status='open'", [p.id]))
          .length >= 5
      )
        throw new GameError('You can post up to five open offers.');
      if (
        !(
          await sql(
            'UPDATE inventory SET reserved=reserved+1 WHERE profile_id=$1 AND card_id=$2 AND quantity>reserved RETURNING card_id',
            [p.id, offered],
          )
        ).length
      )
        throw new GameError('You need an available copy to offer.');
      const id = randomUUID();
      await sql(
        'INSERT INTO trade_offers(id,owner_id,offered_card,wanted_card,price) VALUES($1,$2,$3,$4,$5)',
        [id, p.id, offered, wanted, wanted === null ? price : null],
      );
      return { id };
    });
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
    await this.db.tx(async (sql) => {
      const [o] = await sql<Offer>('SELECT * FROM trade_offers WHERE id=$1', [id]);
      if (!o || o.status !== 'open') throw new GameError('Offer is no longer open.', 409);
      if (
        o.owner_id === p.id ||
        (
          await sql(
            'SELECT 1 FROM profile_accounts a JOIN profile_accounts b ON a.auth_user_id=b.auth_user_id WHERE a.profile_id=$1 AND b.profile_id=$2 AND a.auth_user_id IS NOT NULL',
            [o.owner_id, p.id],
          )
        ).length
      )
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
      for (const who of [p.id, o.owner_id]) await pruneDeck(sql, who);
      for (const who of [p.id, o.owner_id])
        await sql(
          "INSERT INTO achievement_unlocks(profile_id,achievement_id) SELECT $1,'collector' WHERE (SELECT count(DISTINCT coalesce(d.definition->>'baseCardId',i.card_id)) FROM inventory i JOIN card_definitions d ON d.id=i.card_id WHERE i.profile_id=$1 AND i.quantity>0)>=50 ON CONFLICT DO NOTHING",
          [who],
        );
    });
  }
}
