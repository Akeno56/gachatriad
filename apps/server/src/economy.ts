import { randomInt, randomUUID } from 'node:crypto';
import { randomDeck, seededRandom } from '@gacha-triad/engine';
import { ALL_CARDS, CARDS } from '@gacha-triad/shared';
import { ECONOMY, type BoosterView } from '@gacha-triad/shared/platform';
import { Database, type Sql } from './database';
import { GameError } from './errors';

interface PackRow {
  new_cards: string[];
  id: string;
  source: 'starter' | 'purchase' | 'admin';
  cost: number;
  cards: string[] | null;
  created_at: Date;
  opened_at: Date | null;
}
const definitions = new Map(ALL_CARDS.map((c) => [c.id, c]));
function view(pack: PackRow): BoosterView {
  return {
    newCardIds: pack.opened_at ? (pack.new_cards ?? []) : [],
    id: pack.id,
    source: pack.source,
    cost: pack.cost,
    createdAt: new Date(pack.created_at).toISOString(),
    openedAt: pack.opened_at ? new Date(pack.opened_at).toISOString() : null,
    cards: pack.opened_at ? (pack.cards ?? []).map((id) => definitions.get(id)!) : [],
  };
}
function rarity(weights: readonly number[]) {
  let roll = randomInt(weights.reduce((a, b) => a + b, 0));
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i + 1;
  }
  throw Error('Invalid rarity weights.');
}
export class Economy {
  constructor(readonly db: Database) {}
  async grantStarter(sql: Sql, profileId: string) {
    for (let i = 0; i < 3; i++)
      await sql(
        "INSERT INTO booster_packs(id,profile_id,source,grant_index) VALUES($1,$2,'starter',$3) ON CONFLICT DO NOTHING",
        [randomUUID(), profileId, i],
      );
  }
  async list(profileId: string) {
    return this.db.read(async (sql) =>
      (
        await sql<PackRow>(
          'SELECT * FROM booster_packs WHERE profile_id=$1 ORDER BY (opened_at IS NULL) DESC,created_at DESC,id LIMIT 100',
          [profileId],
        )
      ).map(view),
    );
  }
  async purchase(profileId: string, requestId: unknown) {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId))
      throw new GameError('A valid purchase request ID is required.');
    return this.db.tx(async (sql) => {
      const [previous] = await sql<PackRow>(
        'SELECT * FROM booster_packs WHERE profile_id=$1 AND request_id=$2',
        [profileId, requestId],
      );
      if (previous) return view(previous);
      const debited = await sql(
        'UPDATE profiles SET prisms=prisms-$1 WHERE id=$2 AND prisms>=$1 RETURNING id',
        [ECONOMY.packCost, profileId],
      );
      if (!debited.length)
        throw new GameError(`You need ${ECONOMY.packCost} Stellar Prisms to buy a booster.`, 409);
      const packId = randomUUID();
      const [pack] = await sql<PackRow>(
        "INSERT INTO booster_packs(id,profile_id,source,request_id,cost) VALUES($1,$2,'purchase',$3,$4) RETURNING *",
        [packId, profileId, requestId, ECONOMY.packCost],
      );
      await sql(
        "INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,'booster',$4)",
        [randomUUID(), profileId, -ECONOMY.packCost, `pack:${packId}`],
      );
      return view(pack);
    });
  }
  async open(profileId: string, packId: string) {
    return this.db.tx(async (sql) => {
      const [pack] = await sql<PackRow>(
        'SELECT * FROM booster_packs WHERE id=$1 AND profile_id=$2',
        [packId, profileId],
      );
      if (!pack) throw new GameError('Booster not found.', 404);
      if (pack.opened_at) return view(pack);
      const owned = await sql<{ card_id: string }>(
        'SELECT card_id FROM inventory WHERE profile_id=$1 AND quantity>0',
        [profileId],
      );
      const ownedBases = new Set(
        owned.map((c) => definitions.get(c.card_id)?.baseCardId ?? c.card_id),
      );
      const selected: string[] = [];
      const newCardIds: string[] = [];
      const selectedBases = new Set<string>();
      for (let slot = 0; slot < 5; slot++) {
        const weights =
          slot === 4
            ? ECONOMY.guaranteedWeights
            : pack.source === 'starter'
              ? ECONOMY.starterWeights
              : ECONOMY.standardWeights;
        const rank = rarity(weights);
        let pool = CARDS.filter((c) => c.rarity === rank && !selectedBases.has(c.id));
        if (pack.source === 'starter' && slot < 4) {
          const fresh = pool.filter((c) => !ownedBases.has(c.id));
          if (fresh.length) pool = fresh;
        }
        if (!pool.length) throw Error('Booster pool exhausted.');
        const base = pool[randomInt(pool.length)];
        selectedBases.add(base.id);
        const cardId = randomInt(10000) < ECONOMY.holoPer10000 ? `${base.id}::holo` : base.id;
        selected.push(cardId);
        if (!owned.some((c) => c.card_id === cardId)) newCardIds.push(cardId);
        await sql(
          'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=inventory.quantity+1',
          [profileId, cardId],
        );
        await sql(
          "INSERT INTO inventory_ledger(id,profile_id,card_id,delta,kind) VALUES($1,$2,$3,1,'booster')",
          [randomUUID(), profileId, cardId],
        );
      }
      const [opened] = await sql<PackRow>(
        'UPDATE booster_packs SET cards=$1::jsonb,opened_at=now(),new_cards=$3::jsonb WHERE id=$2 RETURNING *',
        [JSON.stringify(selected), packId, JSON.stringify(newCardIds)],
      );
      const [p] = await sql<{ default_deck: string[] }>(
        'SELECT default_deck FROM profiles WHERE id=$1',
        [profileId],
      );
      if (p.default_deck.length !== 5) {
        const pool = await sql<{ card_id: string }>(
          'SELECT card_id FROM inventory WHERE profile_id=$1 AND quantity>reserved',
          [profileId],
        );
        let deck: string[] | null = null;
        try {
          deck = randomDeck(
            pool.map((c) => definitions.get(c.card_id)!),
            seededRandom(randomInt(2 ** 32)),
          ).map((c) => c.id);
        } catch {
          /* Opening a paid/gift pack must still persist even when a legal deck cannot be built yet. */
        }
        if (deck)
          await sql('UPDATE profiles SET default_deck=$1::jsonb WHERE id=$2', [
            JSON.stringify(deck),
            profileId,
          ]);
      }
      return view(opened);
    });
  }
  async reward(sql: Sql, profileId: string, matchId: string, amount: number) {
    const rows = await sql(
      "INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,'match',$4) ON CONFLICT DO NOTHING RETURNING id",
      [randomUUID(), profileId, amount, `match:${matchId}`],
    );
    if (rows.length)
      await sql('UPDATE profiles SET prisms=prisms+$1 WHERE id=$2', [amount, profileId]);
  }
  async grant(
    profileId: unknown,
    kind: unknown,
    amount: unknown,
    requestId: unknown,
    actor: string,
  ) {
    if (
      typeof profileId !== 'string' ||
      !['prisms', 'boosters'].includes(String(kind)) ||
      !Number.isInteger(amount) ||
      typeof amount !== 'number' ||
      amount < 1 ||
      amount > (kind === 'prisms' ? 1000000 : 100) ||
      typeof requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)
    )
      throw new GameError(
        'Choose a player, 1–1,000,000 Prisms or 1–100 boosters, and a valid request ID.',
      );
    return this.db.tx(async (sql) => {
      const [previous] = await sql<{ profile_id: string; kind: string; amount: number }>(
        'SELECT * FROM admin_grants WHERE id=$1',
        [requestId],
      );
      if (previous) {
        if (
          previous.profile_id !== profileId ||
          previous.kind !== kind ||
          previous.amount !== amount
        )
          throw new GameError('This grant request ID is already used.', 409);
        return { ok: true };
      }
      if (
        !(
          await sql(
            'SELECT 1 FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id WHERE p.id=$1 AND NOT p.is_bot',
            [profileId],
          )
        ).length
      )
        throw new GameError('Player not found.', 404);
      await sql(
        'INSERT INTO admin_grants(id,profile_id,kind,amount,actor) VALUES($1,$2,$3,$4,$5)',
        [requestId, profileId, kind, amount, actor],
      );
      if (kind === 'prisms') {
        if (
          !(
            await sql(
              'UPDATE profiles SET prisms=prisms+$1 WHERE id=$2 AND prisms<=2147483647-$1 RETURNING id',
              [amount, profileId],
            )
          ).length
        )
          throw new GameError('Currency balance limit reached.');
        await sql(
          "INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,'admin-grant',$4)",
          [randomUUID(), profileId, amount, `grant:${requestId}`],
        );
      } else
        for (let i = 0; i < amount; i++)
          await sql(
            "INSERT INTO booster_packs(id,profile_id,source,request_id) VALUES($1,$2,'admin',$3)",
            [randomUUID(), profileId, `grant:${requestId}:${i}`],
          );
      await sql(
        "INSERT INTO moderation_log(id,auth_user_id,action,reason) SELECT $1,auth_user_id,'grant',$2 FROM profile_accounts WHERE profile_id=$3 AND is_primary",
        [randomUUID(), `${actor}: ${amount} ${kind}`, profileId],
      );
      return { ok: true };
    });
  }
}
