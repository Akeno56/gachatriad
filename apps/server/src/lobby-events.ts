import { supportsTradeOne } from '@gacha-triad/engine';
import { randomUUID } from 'node:crypto';
import {
  LOBBY_EVENT_GOALS,
  type LobbyEvent,
  type LobbyEventPrize,
} from '@gacha-triad/shared/platform';
import type { Database, Sql } from './database';
import { GameError } from './errors';
import { cleanRules } from './store';

const fields =
  'id,name,rules,trade_rule AS "tradeRule",allow_bots AS "allowBots",starts_at AS "startsAt",ends_at AS "endsAt",prizes,locked';
const toEvent = (row: LobbyEvent): LobbyEvent => ({
  ...row,
  startsAt: Number(row.startsAt),
  endsAt: Number(row.endsAt),
});

function readPrizes(input: unknown): LobbyEventPrize[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 10)
    throw new GameError('An event can have up to 10 rewards.');
  return input.map((item) => {
    const goal = LOBBY_EVENT_GOALS.find((key) => key === item?.goal);
    if (!goal) throw new GameError('Choose a reward objective.');
    const { kind, name, amount } = item.reward ?? {};
    if (
      kind === 'title' &&
      typeof name === 'string' &&
      name.trim().length > 0 &&
      name.trim().length <= 60
    )
      return { goal, reward: { kind, name: name.trim().replace(/\s+/g, ' ') } };
    if (
      (kind === 'prisms' || kind === 'boosters') &&
      Number.isInteger(amount) &&
      amount >= 1 &&
      amount <= (kind === 'prisms' ? 1_000_000 : 100)
    )
      return { goal, reward: { kind, amount } };
    throw new GameError('Enter a valid reward amount or title.');
  });
}

export async function activeLobbyEvent(sql: Sql, id: string) {
  const [row] = await sql<LobbyEvent>(
    `SELECT ${fields} FROM lobby_events WHERE id=$1 AND NOT cancelled AND starts_at<=$2 AND ends_at>$2`,
    [id, Date.now()],
  );
  if (!row) throw new GameError('This lobby event is not active.', 409);
  return toEvent(row);
}

export class LobbyEvents {
  constructor(readonly db: Database) {}

  async list() {
    const rows = await this.db.read((sql) =>
      sql<LobbyEvent>(
        `SELECT ${fields} FROM lobby_events WHERE NOT cancelled AND ends_at>$1 ORDER BY starts_at,id`,
        [Date.now()],
      ),
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
    const prizes = readPrizes(input.prizes);
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
        JSON.stringify(prizes),
      ];
      if (creating) {
        await sql(
          `INSERT INTO lobby_events(id,name,starts_at,ends_at,rules,trade_rule,allow_bots,prizes)
          VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb) ON CONFLICT(id) DO NOTHING`,
          values,
        );
        return (
          await sql<LobbyEvent>(
            `SELECT ${fields} FROM lobby_events WHERE id=$1 AND NOT cancelled`,
            [id],
          )
        )[0];
      }
      if ((await sql('SELECT 1 FROM lobby_events WHERE id=$1 AND locked', [id])).length)
        throw new GameError('An event cannot be edited after its first table opens.', 409);
      return (
        await sql<LobbyEvent>(
          `UPDATE lobby_events SET name=$2,starts_at=$3,ends_at=$4,rules=$5::jsonb,trade_rule=$6,allow_bots=$7,prizes=$8::jsonb WHERE id=$1 AND NOT cancelled AND NOT settled RETURNING ${fields}`,
          values,
        )
      )[0];
    });
    if (!row) throw new GameError('Lobby event not found.', 404);
    return toEvent(row);
  }

  async cancel(id: string) {
    await this.db.tx(async (sql) => {
      const cancelled = await sql(
        'UPDATE lobby_events SET cancelled=true WHERE id=$1 AND NOT settled AND ends_at>$2 RETURNING id',
        [id, Date.now()],
      );
      if (cancelled.length)
        await sql(
          "UPDATE lobbies SET status='closed' WHERE lobby_event_id=$1 AND status='waiting'",
          [id],
        );
    });
  }

  async settle() {
    return this.db.tx(async (sql) => {
      const events = await sql<LobbyEvent>(
        `SELECT ${fields} FROM lobby_events WHERE NOT settled AND NOT cancelled AND ends_at<=$1 ORDER BY ends_at LIMIT 10`,
        [Date.now()],
      );
      let changed = false;
      for (const event of events.map(toEvent)) {
        await sql(
          "UPDATE lobbies SET status='closed' WHERE lobby_event_id=$1 AND status='waiting'",
          [event.id],
        );
        if (event.prizes.length) changed = (await this.award(sql, event)) || changed;
        await sql('UPDATE lobby_events SET settled=true WHERE id=$1', [event.id]);
      }
      return changed || events.length > 0;
    });
  }

  private async award(sql: Sql, event: LobbyEvent) {
    const scores = await sql<{ id: string; played: number; wins: number; losses: number }>(
      `SELECT entrant.id,count(*)::int AS played,
         count(*) FILTER (WHERE entrant.seat=m.winner)::int AS wins,
         count(*) FILTER (WHERE entrant.seat<>m.winner)::int AS losses
       FROM matches m JOIN profiles a ON a.id=m.player0 AND NOT a.is_bot
       JOIN profiles b ON b.id=m.player1 AND NOT b.is_bot
       CROSS JOIN LATERAL (VALUES (a.id,0),(b.id,1)) entrant(id,seat)
       WHERE m.lobby_event_id=$1 AND m.status='complete' AND m.end_reason IS NULL
         AND m.completed_at < to_timestamp($2::double precision/1000)
       GROUP BY entrant.id`,
      [event.id, event.endsAt],
    );
    const metrics = {
      'play-one': 'played',
      'win-one': 'wins',
      'most-played': 'played',
      'most-wins': 'wins',
      'most-losses': 'losses',
    } as const;
    for (const [index, { goal, reward }] of event.prizes.entries()) {
      const metric = metrics[goal];
      const needed = goal.startsWith('most-')
        ? scores.reduce((max, score) => Math.max(max, score[metric]), 1)
        : 1;
      const title =
        reward.kind === 'title' ? `event-title:${event.id}:${index}:${reward.name}` : null;
      for (const score of scores.filter((entry) => entry[metric] >= needed)) {
        const { id } = score;
        const granted = await sql(
          'INSERT INTO lobby_event_awards(event_id,reward_index,profile_id,title_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING profile_id',
          [event.id, index, id, title],
        );
        if (!granted.length) continue;
        if (reward.kind === 'prisms') {
          const [profile] = await sql<{ prisms: number }>(
            'SELECT prisms FROM profiles WHERE id=$1',
            [id],
          );
          const amount = Math.min(reward.amount, 2_147_483_647 - profile.prisms);
          await sql('UPDATE profiles SET prisms=prisms+$2 WHERE id=$1', [id, amount]);
          await sql(
            "INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,'lobby-event',$4)",
            [randomUUID(), id, amount, `lobby-event:${event.id}:${index}`],
          );
        } else if (reward.kind === 'boosters') {
          for (let n = 0; n < reward.amount; n++)
            await sql("INSERT INTO booster_packs(id,profile_id,source) VALUES($1,$2,'admin')", [
              randomUUID(),
              id,
            ]);
        }
      }
    }
    return scores.length > 0;
  }
}
