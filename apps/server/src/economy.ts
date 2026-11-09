import { randomInt, randomUUID } from 'node:crypto';
import { randomDeck, seededRandom } from '@gacha-triad/engine';
import { ALL_CARDS, CARDS } from '@gacha-triad/shared';
import {
  ECONOMY,
  BOOSTER_TYPES,
  type BoosterType,
  type BoosterView,
  type DuplicateInput,
  type DuplicateResult,
  type DailyBooster,
} from '@gacha-triad/shared/platform';
import { Database, type Sql } from './database';
import { GameError } from './errors';
import { rollRarity as rarity, rollFinish } from './draft-packs';

interface PackRow {
  pack_type: BoosterType;
  new_cards: string[];
  id: string;
  source: 'starter' | 'purchase' | 'admin' | 'daily';
  cost: number;
  cards: string[] | null;
  created_at: Date;
  opened_at: Date | null;
}
const definitions = new Map(ALL_CARDS.map((c) => [c.id, c]));
function view(pack: PackRow): BoosterView {
  return {
    type: pack.pack_type,
    newCardIds: pack.opened_at ? (pack.new_cards ?? []) : [],
    id: pack.id,
    source: pack.source,
    cost: pack.cost,
    createdAt: new Date(pack.created_at).toISOString(),
    openedAt: pack.opened_at ? new Date(pack.opened_at).toISOString() : null,
    cards: pack.opened_at ? (pack.cards ?? []).map((id) => definitions.get(id)!) : [],
  };
}
export class Economy {
  constructor(readonly db: Database) {}
  async purchaseCard(profileId: string, cardId: unknown, requestId: unknown) {
    const card = typeof cardId === 'string' ? definitions.get(cardId) : undefined;
    if (
      !card ||
      !card.enabled ||
      card.finish === 'holo' ||
      typeof requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)
    )
      throw new GameError('Choose a Standard card and a valid purchase request.');
    const cost = ECONOMY.cardPrices[card.rarity - 1];
    return this.db.tx(async (sql) => {
      const [previous] = await sql<{ card_id: string; cost: number }>(
        'SELECT card_id,cost FROM card_purchases WHERE profile_id=$1 AND request_id=$2',
        [profileId, requestId],
      );
      if (previous) {
        if (previous.card_id !== card.id)
          throw new GameError('This purchase request belongs to another card.', 409);
        return { card, cost: previous.cost };
      }
      if (
        !(
          await sql(
            'UPDATE profiles SET prisms=prisms-$1 WHERE id=$2 AND prisms>=$1 RETURNING id',
            [cost, profileId],
          )
        ).length
      )
        throw new GameError(`You need ${cost} Stellar Prisms for this card.`, 409);
      await sql(
        'INSERT INTO card_purchases(profile_id,request_id,card_id,cost) VALUES($1,$2,$3,$4)',
        [profileId, requestId, card.id, cost],
      );
      await sql(
        'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=inventory.quantity+1',
        [profileId, card.id],
      );
      await sql(
        "INSERT INTO inventory_ledger(id,profile_id,card_id,delta,kind) VALUES($1,$2,$3,1,'card-purchase')",
        [randomUUID(), profileId, card.id],
      );
      await sql(
        "INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,'card-purchase',$4)",
        [randomUUID(), profileId, -cost, `card:${requestId}`],
      );
      return { card, cost };
    });
  }
  async daily(profileId: string, registered: boolean): Promise<DailyBooster> {
    const day = Math.floor(Date.now() / 86400000);
    const [pack] = await this.db.read((sql) =>
      sql<{ id: string }>(
        "SELECT id FROM booster_packs WHERE profile_id=$1 AND source='daily' AND grant_index=$2",
        [profileId, day],
      ),
    );
    return {
      available: registered && !pack,
      resetAt: new Date((day + 1) * 86400000).toISOString(),
      packId: pack?.id ?? null,
    };
  }
  async claimDaily(profileId: string, registered: boolean) {
    if (!registered) throw new GameError('Register an account to claim a daily booster.', 403);
    const day = Math.floor(Date.now() / 86400000);
    return this.db.tx(async (sql) => {
      await sql(
        "INSERT INTO booster_packs(id,profile_id,source,grant_index) VALUES($1,$2,'daily',$3) ON CONFLICT DO NOTHING",
        [randomUUID(), profileId, day],
      );
      const [pack] = await sql<PackRow>(
        "SELECT * FROM booster_packs WHERE profile_id=$1 AND source='daily' AND grant_index=$2",
        [profileId, day],
      );
      return view(pack);
    });
  }
  async duplicates(
    profileId: string,
    kind: unknown,
    inputs: unknown,
    requestId: unknown,
  ): Promise<DuplicateResult> {
    if (
      !['recycle', 'trade-up'].includes(String(kind)) ||
      typeof requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(requestId) ||
      !Array.isArray(inputs) ||
      !inputs.length ||
      inputs.length > 100
    )
      throw new GameError('Choose duplicate cards and a valid action.');
    const selected: DuplicateInput[] = inputs
      .map((entry) => {
        if (
          !entry ||
          typeof entry.cardId !== 'string' ||
          !definitions.has(entry.cardId) ||
          !Number.isInteger(entry.count) ||
          entry.count < 1 ||
          entry.count > 1000
        )
          throw new GameError('Select positive whole numbers of owned duplicate cards.');
        return { cardId: entry.cardId, count: entry.count };
      })
      .sort((a, b) => a.cardId.localeCompare(b.cardId));
    const total = selected.reduce((s, c) => s + c.count, 0);
    if (new Set(selected.map((c) => c.cardId)).size !== selected.length || total > 1000)
      throw new GameError('Select each card once, up to 1,000 copies per action.');
    const rank = definitions.get(selected[0].cardId)!.rarity;
    if (
      kind === 'trade-up' &&
      (total < 5 ||
        total > 100 ||
        total % 5 !== 0 ||
        rank < 1 ||
        rank > 4 ||
        selected.some((c) => definitions.get(c.cardId)!.rarity !== rank))
    )
      throw new GameError(
        'Trade Up requires groups of five duplicate copies of the same rarity, from 1★ to 4★, up to 20 groups.',
      );
    return this.db.tx(async (sql) => {
      const [previous] = await sql<{
        kind: string;
        inputs: DuplicateInput[];
        result: DuplicateResult;
      }>('SELECT * FROM duplicate_actions WHERE profile_id=$1 AND request_id=$2', [
        profileId,
        requestId,
      ]);
      if (previous) {
        if (
          previous.kind !== kind ||
          previous.inputs.length !== selected.length ||
          previous.inputs.some(
            (c, i) => c.cardId !== selected[i].cardId || c.count !== selected[i].count,
          )
        )
          throw new GameError('This request ID belongs to another duplicate action.', 409);
        return previous.result;
      }
      for (const input of selected) {
        const changed = await sql(
          'UPDATE inventory SET quantity=quantity-$1 WHERE profile_id=$2 AND card_id=$3 AND quantity-$1>=1 AND quantity-$1>=reserved RETURNING card_id',
          [input.count, profileId, input.cardId],
        );
        if (!changed.length)
          throw new GameError(
            'Not enough spare copies. At least one copy of each card and all reserved copies must remain.',
            409,
          );
        await sql(
          'INSERT INTO inventory_ledger(id,profile_id,card_id,delta,kind) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(), profileId, input.cardId, -input.count, kind],
        );
      }
      const result: DuplicateResult = {
        kind: kind as DuplicateResult['kind'],
        consumed: total,
        prisms: 0,
        card: null,
      };
      if (kind === 'recycle') {
        result.prisms = selected.reduce(
          (s, c) => s + c.count * ECONOMY.recyclePrisms[definitions.get(c.cardId)!.rarity - 1],
          0,
        );
        if (
          !(
            await sql(
              'UPDATE profiles SET prisms=prisms+$1 WHERE id=$2 AND prisms<=2147483647-$1 RETURNING id',
              [result.prisms, profileId],
            )
          ).length
        )
          throw new GameError('Currency balance limit reached.', 409);
        await sql(
          "INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,'recycle',$4)",
          [randomUUID(), profileId, result.prisms, `duplicates:${requestId}`],
        );
      } else {
        const pool = CARDS.filter((c) => c.enabled && c.rarity === rank + 1);
        result.cards = [];
        for (let roll = 0; roll < total / 5; roll++) {
          const base = pool[randomInt(pool.length)];
          const id = rollFinish(base.id, ECONOMY.holoPer10000);
          result.cards.push(definitions.get(id)!);
          await sql(
            'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=inventory.quantity+1',
            [profileId, id],
          );
          await sql(
            "INSERT INTO inventory_ledger(id,profile_id,card_id,delta,kind) VALUES($1,$2,$3,1,'trade-up')",
            [randomUUID(), profileId, id],
          );
        }
        result.card = result.cards[0];
      }
      await sql(
        'INSERT INTO duplicate_actions(profile_id,request_id,kind,inputs,result) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
        [profileId, requestId, kind, JSON.stringify(selected), JSON.stringify(result)],
      );
      return result;
    });
  }
  async grantStarter(sql: Sql, profileId: string) {
    for (let i = 0; i < 3; i++)
      await sql(
        "INSERT INTO booster_packs(id,profile_id,source,grant_index,pack_type) VALUES($1,$2,'starter',$3,'starter') ON CONFLICT DO NOTHING",
        [randomUUID(), profileId, i],
      );
  }
  async list(profileId: string) {
    return this.db.read(async (sql) =>
      (
        await sql<PackRow>(
          'SELECT * FROM booster_packs WHERE profile_id=$1 AND (opened_at IS NULL OR id IN (SELECT id FROM booster_packs WHERE profile_id=$1 AND opened_at IS NOT NULL ORDER BY opened_at DESC,id LIMIT 20)) ORDER BY (opened_at IS NULL) DESC,created_at DESC,id',
          [profileId],
        )
      ).map(view),
    );
  }
  async purchase(
    profileId: string,
    requestId: unknown,
    quantity: unknown = 1,
    packType: unknown = 'standard',
  ) {
    const type = BOOSTER_TYPES.find((pack) => pack.id === packType && pack.id !== 'starter');
    if (!type)
      throw new GameError('Choose an available booster type. Starter boosters cannot be bought.');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId))
      throw new GameError('A valid purchase request ID is required.');
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    )
      throw new GameError('Choose between 1 and 100 boosters.');
    return this.db.tx(async (sql) => {
      const [previous] = await sql<{
        quantity: number;
        total_cost: number;
        pack_ids: string[];
        pack_type: BoosterType;
      }>('SELECT * FROM booster_purchases WHERE profile_id=$1 AND request_id=$2', [
        profileId,
        requestId,
      ]);
      if (previous) {
        if (previous.quantity !== quantity || previous.pack_type !== type.id)
          throw new GameError(
            'This purchase request already uses another quantity or booster type.',
            409,
          );
        const rows = await sql<PackRow>(
          'SELECT * FROM booster_packs WHERE profile_id=$1 AND id=ANY($2::text[])',
          [profileId, previous.pack_ids],
        );
        const packs = previous.pack_ids.map((id) => view(rows.find((p) => p.id === id)!));
        return { ...packs[0], packs, quantity, totalCost: previous.total_cost };
      }
      const totalCost = quantity * ECONOMY.packCost;
      const debited = await sql(
        'UPDATE profiles SET prisms=prisms-$1 WHERE id=$2 AND prisms>=$1 RETURNING id',
        [totalCost, profileId],
      );
      if (!debited.length)
        throw new GameError(
          `You need ${totalCost} Stellar Prisms to buy ${quantity} booster${quantity === 1 ? '' : 's'}.`,
          409,
        );
      const packs: BoosterView[] = [];
      for (let i = 0; i < quantity; i++) {
        const packId = randomUUID();
        const [pack] = await sql<PackRow>(
          "INSERT INTO booster_packs(id,profile_id,source,request_id,cost,pack_type) VALUES($1,$2,'purchase',$3,$4,$5) RETURNING *",
          [packId, profileId, i === 0 ? requestId : `${requestId}:${i}`, ECONOMY.packCost, type.id],
        );
        await sql(
          "INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,'booster',$4)",
          [randomUUID(), profileId, -ECONOMY.packCost, `pack:${packId}`],
        );
        packs.push(view(pack));
      }
      await sql(
        'INSERT INTO booster_purchases(profile_id,request_id,quantity,total_cost,pack_ids,pack_type) VALUES($1,$2,$3,$4,$5::jsonb,$6)',
        [
          profileId,
          requestId,
          quantity,
          totalCost,
          JSON.stringify(packs.map((p) => p.id)),
          type.id,
        ],
      );
      return { ...packs[0], packs, quantity, totalCost };
    });
  }
  async open(profileId: string, packId: string) {
    return this.db.tx((sql) => this.openPack(sql, profileId, packId));
  }
  async openBatch(profileId: string, packIds: unknown) {
    if (
      !Array.isArray(packIds) ||
      packIds.length < 1 ||
      packIds.length > 10 ||
      packIds.some((id) => typeof id !== 'string') ||
      new Set(packIds).size !== packIds.length
    )
      throw new GameError('Choose 1–10 different boosters.');
    return this.db.tx(async (sql) => {
      const opened: BoosterView[] = [];
      for (const id of packIds) opened.push(await this.openPack(sql, profileId, id));
      return opened;
    });
  }
  private async openPack(sql: Sql, profileId: string, packId: string) {
    const [pack] = await sql<PackRow>('SELECT * FROM booster_packs WHERE id=$1 AND profile_id=$2', [
      packId,
      profileId,
    ]);
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
    const packType = BOOSTER_TYPES.find((type) => type.id === pack.pack_type);
    if (!packType) throw new GameError('Unknown booster type.', 409);
    const starter = packType.id === 'starter';
    for (let slot = 0; slot < 5; slot++) {
      const weights =
        slot === 4
          ? starter
            ? ECONOMY.starterGuaranteedWeights
            : ECONOMY.guaranteedWeights
          : starter
            ? ECONOMY.starterWeights
            : ECONOMY.standardWeights;
      const rank = rarity(weights);
      let pool = CARDS.filter(
        (c) =>
          c.enabled &&
          c.rarity === rank &&
          !selectedBases.has(c.id) &&
          (packType.universes as readonly string[]).includes(c.universeId),
      );
      if (starter && slot < 4) {
        const fresh = pool.filter((c) => !ownedBases.has(c.id));
        if (fresh.length) pool = fresh;
      }
      if (!pool.length) throw Error('Booster pool exhausted.');
      const base = pool[randomInt(pool.length)];
      selectedBases.add(base.id);
      const cardId = rollFinish(
        base.id,
        starter ? ECONOMY.starterHoloPer10000 : ECONOMY.holoPer10000,
      );
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
