import { randomUUID } from 'node:crypto';
import { ALL_CARDS } from '@gacha-triad/shared';
import { validateDeck } from '@gacha-triad/engine';
import type { DeckLoadout, DeckLoadoutsView } from '@gacha-triad/shared/platform';
import type { Database, Sql } from './database';
import { GameError } from './errors';
import { weekWindow } from './journey';

const byId = new Map(ALL_CARDS.map((card) => [card.id, card]));
const limit = 12;
type Row = { id: string; name: string; cards: string[]; revision: number; updated_at: Date };
const view = (row: Row): DeckLoadout => ({
  id: row.id,
  name: row.name,
  cards: row.cards,
  revision: row.revision,
  updatedAt: new Date(row.updated_at).toISOString(),
});
function cleanName(value: unknown) {
  if (typeof value !== 'string')
    throw new GameError('Choose a loadout name between 1 and 40 characters.');
  const name = value.trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 40 || /[\p{Cc}\p{Cf}]/u.test(name))
    throw new GameError('Choose a loadout name between 1 and 40 characters.');
  return name;
}
function cleanCards(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > 5 ||
    value.some((id) => typeof id !== 'string' || !byId.has(id))
  )
    throw new GameError('Choose up to five known cards.');
  const cards = value.map((id) => byId.get(id)!);
  const errors = validateDeck(cards).filter((error) => error !== 'Select exactly five cards.');
  if (errors.length) throw new GameError(errors.join(' '));
  return value as string[];
}
function checkRevision(value: unknown, row: Row) {
  if (!Number.isSafeInteger(value) || value !== row.revision)
    throw new GameError(
      'This loadout changed elsewhere. Load the latest saved version before saving again.',
      409,
    );
}
async function owned(sql: Sql, profileId: string, cards: string[], previous: string[] = []) {
  const rows = await sql<{ card_id: string }>(
    'SELECT card_id FROM inventory WHERE profile_id=$1 AND quantity>0',
    [profileId],
  );
  if (cards.some((id) => !previous.includes(id) && !rows.some((row) => row.card_id === id)))
    throw new GameError('You can only add cards from your own collection.');
}
export class DeckLoadouts {
  constructor(readonly db: Database) {}
  private async load(sql: Sql, profileId: string, id: string) {
    const [row] = await sql<Row>(
      'SELECT id,name,cards,revision,updated_at FROM deck_loadouts WHERE id=$1 AND profile_id=$2',
      [id, profileId],
    );
    if (!row) throw new GameError('Loadout not found.', 404);
    return row;
  }
  async list(profileId: string): Promise<DeckLoadoutsView> {
    return this.db.read(async (sql) => {
      const rows = await sql<Row>(
        'SELECT id,name,cards,revision,updated_at FROM deck_loadouts WHERE profile_id=$1 ORDER BY created_at,id',
        [profileId],
      );
      const [p] = await sql<{ active_loadout_id: string | null; default_deck: string[] }>(
        'SELECT active_loadout_id,default_deck FROM profiles WHERE id=$1',
        [profileId],
      );
      const active = rows.find(
        (row) =>
          row.id === p.active_loadout_id &&
          JSON.stringify(row.cards) === JSON.stringify(p.default_deck),
      );
      return { loadouts: rows.map(view), activeId: active?.id ?? null, limit };
    });
  }
  async save(profileId: string, body: Record<string, unknown>, id?: string) {
    return this.db.tx(async (sql) => {
      await sql('SELECT id FROM profiles WHERE id=$1 FOR UPDATE', [profileId]);
      const previous = id ? await this.load(sql, profileId, id) : null;
      if (previous) checkRevision(body.revision, previous);
      if (
        !previous &&
        (await sql('SELECT id FROM deck_loadouts WHERE profile_id=$1', [profileId])).length >= limit
      )
        throw new GameError('You can save up to 12 loadouts. Delete one before creating another.');
      const name = body.name === undefined && previous ? previous.name : cleanName(body.name);
      const cards = body.cards === undefined && previous ? previous.cards : cleanCards(body.cards);
      if (body.cards !== undefined) await owned(sql, profileId, cards, previous?.cards);
      if (
        (
          await sql(
            'SELECT 1 FROM deck_loadouts WHERE profile_id=$1 AND lower(name)=lower($2) AND id<>$3',
            [profileId, name, id ?? ''],
          )
        ).length
      )
        throw new GameError('You already have a loadout with that name.');
      const [row] = previous
        ? await sql<Row>(
            'UPDATE deck_loadouts SET name=$1,cards=$2::jsonb,revision=revision+1,updated_at=now() WHERE id=$3 AND profile_id=$4 RETURNING *',
            [name, JSON.stringify(cards), id, profileId],
          )
        : await sql<Row>(
            'INSERT INTO deck_loadouts(id,profile_id,name,cards) VALUES($1,$2,$3,$4::jsonb) RETURNING *',
            [randomUUID(), profileId, name, JSON.stringify(cards)],
          );
      if (previous && JSON.stringify(previous.cards) !== JSON.stringify(cards))
        await sql(
          'UPDATE profiles SET active_loadout_id=NULL WHERE id=$1 AND active_loadout_id=$2',
          [profileId, id],
        );
      if (cards.length === 5) {
        await sql(
          "INSERT INTO journey_stamps(profile_id,chapter) VALUES($1,'deck') ON CONFLICT DO NOTHING",
          [profileId],
        );
        await sql(
          'INSERT INTO journey_deck_weeks(profile_id,week_start) VALUES($1,$2::date) ON CONFLICT DO NOTHING',
          [profileId, weekWindow().week],
        );
      }
      return view(row);
    });
  }
  async activate(profileId: string, id: string, revision: unknown) {
    return this.db.tx(async (sql) => {
      await sql('SELECT id FROM profiles WHERE id=$1 FOR UPDATE', [profileId]);
      const row = await this.load(sql, profileId, id);
      checkRevision(revision, row);
      const cards = cleanCards(row.cards).map((id) => byId.get(id)!);
      const errors = validateDeck(cards);
      if (errors.length) throw new GameError(errors.join(' '));
      if (
        (await sql("SELECT 1 FROM lobbies WHERE host_id=$1 AND status='waiting'", [profileId]))
          .length
      )
        throw new GameError('Leave matchmaking before switching your active deck.', 409);
      const pool = await sql<{ card_id: string }>(
        'SELECT card_id FROM inventory WHERE profile_id=$1 AND quantity-reserved>0',
        [profileId],
      );
      if (row.cards.some((id) => !pool.some((card) => card.card_id === id)))
        throw new GameError(
          'This loadout has missing or locked cards. Replace them before using it.',
        );
      await sql('UPDATE profiles SET default_deck=$1::jsonb,active_loadout_id=$2 WHERE id=$3', [
        JSON.stringify(row.cards),
        id,
        profileId,
      ]);
      return { ok: true };
    });
  }
  async remove(profileId: string, id: string, revision: unknown) {
    return this.db.tx(async (sql) => {
      const row = await this.load(sql, profileId, id);
      checkRevision(revision, row);
      await sql('UPDATE profiles SET active_loadout_id=NULL WHERE id=$1 AND active_loadout_id=$2', [
        profileId,
        id,
      ]);
      await sql('DELETE FROM deck_loadouts WHERE profile_id=$1 AND id=$2', [profileId, id]);
      return { ok: true };
    });
  }
}
