import { supportsTradeOne } from '@gacha-triad/engine';
import type { LobbyEvent } from '@gacha-triad/shared/platform';
import type { Database } from './database';
import { GameError } from './errors';
import { cleanRules } from './store';

const fields =
  'id,name,rules,trade_rule AS "tradeRule",allow_bots AS "allowBots",starts_at AS "startsAt",ends_at AS "endsAt"';
const toEvent = (row: LobbyEvent): LobbyEvent => ({
  ...row,
  startsAt: Number(row.startsAt),
  endsAt: Number(row.endsAt),
});

export class LobbyEvents {
  constructor(readonly db: Database) {}

  async list() {
    const rows = await this.db.read((sql) =>
      sql<LobbyEvent>(`SELECT ${fields} FROM lobby_events WHERE ends_at>$1 ORDER BY starts_at,id`, [
        Date.now(),
      ]),
    );
    return rows.map(toEvent);
  }

  async save(id: string, input: Record<string, unknown>, creating: boolean) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 60)
      throw new GameError('Enter an event name of 1 to 60 characters.');
    const { startsAt, endsAt } = input;
    if (
      typeof startsAt !== 'number' ||
      typeof endsAt !== 'number' ||
      !Number.isFinite(new Date(startsAt).getTime()) ||
      !Number.isFinite(new Date(endsAt).getTime()) ||
      !Number.isInteger(startsAt) ||
      !Number.isInteger(endsAt) ||
      startsAt >= endsAt
    )
      throw new GameError('The event must end after it starts.');
    if (endsAt <= Date.now()) throw new GameError('Choose an event end time in the future.');
    const rules = cleanRules(input.rules);
    const tradeRule = input.tradeRule === 'one' ? 'one' : 'none';
    if (tradeRule === 'one' && !supportsTradeOne(rules))
      throw new GameError(
        'Trade One requires Closed visibility with Same, Plus and Combo enabled.',
      );
    const row = await this.db.tx(async (sql) => {
      const values = [
        id,
        name,
        startsAt,
        endsAt,
        JSON.stringify(rules),
        tradeRule,
        input.allowBots === true,
      ];
      if (creating) {
        await sql(
          `INSERT INTO lobby_events(id,name,starts_at,ends_at,rules,trade_rule,allow_bots)
          VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT(id) DO NOTHING`,
          values,
        );
        return (await sql<LobbyEvent>(`SELECT ${fields} FROM lobby_events WHERE id=$1`, [id]))[0];
      }
      return (
        await sql<LobbyEvent>(
          `UPDATE lobby_events SET name=$2,starts_at=$3,ends_at=$4,rules=$5::jsonb,trade_rule=$6,allow_bots=$7 WHERE id=$1 RETURNING ${fields}`,
          values,
        )
      )[0];
    });
    if (!row) throw new GameError('Lobby event not found.', 404);
    return toEvent(row);
  }

  async cancel(id: string) {
    await this.db.read((sql) => sql('DELETE FROM lobby_events WHERE id=$1', [id]));
  }
}
