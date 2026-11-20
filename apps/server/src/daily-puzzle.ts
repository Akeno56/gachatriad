import { createHmac, randomUUID } from 'node:crypto';
import {
  applyMove,
  createGame,
  legalMoves,
  randomDeck,
  seededRandom,
  winner,
  validateMove,
  type GameState,
} from '@gacha-triad/engine';
import { CARDS } from '@gacha-triad/shared';
import {
  bestPuzzleMove,
  puzzleValue,
  type ArchivedPuzzle,
  type DailyPuzzleView,
  type PuzzleArchivePage,
  type PuzzleEntry,
} from '@gacha-triad/shared/puzzle';
import type { Database, Sql } from './database';
import { GameError } from './errors';

export const PUZZLE_REWARD = 100;
export function puzzleDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
export { puzzleValue } from '@gacha-triad/shared/puzzle';

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && puzzleDay(parsed.getTime()) === value;
}
export function makePuzzle(seed: number): GameState {
  const random = seededRandom(seed);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const decks = [randomDeck(CARDS, random), randomDeck(CARDS, random)] as const;
    let state = createGame(decks, { allOpen: true, same: true, plus: true, combo: true }, () => 0);
    for (let turn = 0; turn < 6; turn++) {
      const moves = legalMoves(state);
      state = applyMove(state, moves[Math.floor(random() * moves.length)]);
    }
    const wins = legalMoves(state).filter((move) => puzzleValue(applyMove(state, move)) > 5);
    if (wins.length === 1) return state;
  }
  throw new Error('Unable to create a uniquely solvable daily puzzle.');
}
interface Run {
  state: GameState;
  attempts: number;
  version: number;
  started_at: Date;
  solved_at: Date | null;
  solve_attempts: number | null;
  elapsed_ms: number | null;
  rewarded: boolean;
  last_start: string | null;
}
export class DailyPuzzles {
  private preparing = new Map<string, Promise<void>>();
  constructor(
    private db: Database,
    private secret: string,
  ) {}
  private async ensure(day: string) {
    if (this.preparing.has(day)) return this.preparing.get(day);
    const work = (async () => {
      const exists = await this.db.read((sql) =>
        sql('SELECT day FROM daily_puzzles WHERE day=$1', [day]),
      );
      if (exists.length) return;
      const seed = createHmac('sha256', this.secret)
        .update(`daily-puzzle-v1:${day}`)
        .digest()
        .readUInt32LE();
      const state = makePuzzle(seed);
      await this.db.read((sql) =>
        sql(
          'INSERT INTO daily_puzzles(day,initial_state) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',
          [day, JSON.stringify(state)],
        ),
      );
    })();
    this.preparing.set(day, work);
    try {
      await work;
    } finally {
      this.preparing.delete(day);
    }
  }
  async archive(before: unknown = puzzleDay()): Promise<PuzzleArchivePage> {
    if (!validDay(before) || before > puzzleDay()) throw new GameError('Invalid archive date.');
    const limit = 12;
    const rows = await this.db.read((sql) =>
      sql<{ day: string }>(
        'SELECT day::text AS day FROM daily_puzzles WHERE day<$1::date ORDER BY day DESC LIMIT $2',
        [before, limit + 1],
      ),
    );
    const days = rows.slice(0, limit).map(({ day }) => day);
    return { days, nextBefore: rows.length > limit ? days.at(-1)! : null };
  }
  async archived(day: unknown): Promise<ArchivedPuzzle> {
    if (!validDay(day) || day >= puzzleDay())
      throw new GameError('Archived puzzle not found.', 404);
    const [row] = await this.db.read((sql) =>
      sql<{ state: GameState }>('SELECT initial_state AS state FROM daily_puzzles WHERE day=$1', [
        day,
      ]),
    );
    if (!row) throw new GameError('Archived puzzle not found.', 404);
    return { day, state: row.state };
  }
  async view(
    profileId: string,
    registered: boolean,
    accountId = profileId,
  ): Promise<DailyPuzzleView> {
    const day = puzzleDay();
    await this.ensure(day);
    return this.db.read(async (sql) => {
      const [run] = await sql<Run>(
        'SELECT * FROM daily_puzzle_runs WHERE day=$1 AND profile_id=$2',
        [day, profileId],
      );
      const claimed =
        registered &&
        (
          await sql("SELECT 1 FROM prism_ledger WHERE kind='daily-puzzle' AND reference=$1", [
            `daily-puzzle:${day}:${accountId}`,
          ])
        ).length > 0;
      const leaderboard = await sql<PuzzleEntry>(
        `SELECT rank() OVER(ORDER BY r.solve_attempts,r.elapsed_ms)::int AS rank,
        p.id AS "playerId",p.name,r.solve_attempts AS attempts,r.elapsed_ms::float8 AS "elapsedMs"
        FROM daily_puzzle_runs r JOIN profiles p ON p.id=r.profile_id
        WHERE r.day=$1 AND r.rewarded AND NOT p.is_bot
        AND NOT EXISTS(SELECT 1 FROM profile_accounts a JOIN server_suspensions s ON s.auth_user_id=a.auth_user_id WHERE a.profile_id=p.id)
        ORDER BY r.solve_attempts,r.elapsed_ms,p.id LIMIT 50`,
        [day],
      );
      return {
        day,
        resetsAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString(),
        reward: PUZZLE_REWARD,
        state: run?.state ?? null,
        version: run?.version ?? 0,
        attempts: run?.attempts ?? 0,
        solved: !!run?.solved_at,
        rewarded: !!claimed,
        registered,
        elapsedMs: run?.elapsed_ms ?? null,
        leaderboard,
      };
    });
  }
  private checkDay(day: unknown) {
    if (day !== puzzleDay())
      throw new GameError('The daily puzzle has reset. Reload to play today’s puzzle.', 409);
    return day as string;
  }
  async start(
    profileId: string,
    registered: boolean,
    input: Record<string, unknown>,
    accountId = profileId,
  ) {
    const day = this.checkDay(input.day);
    const restart = input.restart === true;
    if (typeof input.requestId !== 'string' || !/^[\w-]{8,80}$/.test(input.requestId))
      throw new GameError('A valid puzzle request ID is required.');
    await this.ensure(day);
    await this.db.tx(async (sql) => {
      const [run] = await sql<Run>(
        'SELECT * FROM daily_puzzle_runs WHERE day=$1 AND profile_id=$2',
        [day, profileId],
      );
      if (run && (!restart || run.last_start === input.requestId)) return;
      const [puzzle] = await sql<{ initial_state: GameState }>(
        'SELECT initial_state FROM daily_puzzles WHERE day=$1',
        [day],
      );
      if (!run)
        await sql(
          'INSERT INTO daily_puzzle_runs(day,profile_id,state,last_start) VALUES($1,$2,$3::jsonb,$4)',
          [day, profileId, JSON.stringify(puzzle.initial_state), input.requestId],
        );
      else
        await sql(
          'UPDATE daily_puzzle_runs SET state=$1::jsonb,attempts=attempts+CASE WHEN solved_at IS NULL THEN 1 ELSE 0 END,version=version+1,last_start=$2 WHERE day=$3 AND profile_id=$4',
          [JSON.stringify(puzzle.initial_state), input.requestId, day, profileId],
        );
    });
    return this.view(profileId, registered, accountId);
  }
  private async reward(
    sql: Sql,
    day: string,
    profileId: string,
    registered: boolean,
    accountId: string,
  ) {
    if (!registered) return;
    const rows = await sql(
      'SELECT 1 FROM daily_puzzle_runs WHERE day=$1 AND profile_id=$2 AND solved_at IS NOT NULL AND NOT rewarded',
      [day, profileId],
    );
    if (!rows.length) return;
    const ledger = await sql(
      'INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id',
      [randomUUID(), profileId, PUZZLE_REWARD, 'daily-puzzle', `daily-puzzle:${day}:${accountId}`],
    );
    if (ledger.length) {
      await sql('UPDATE profiles SET prisms=prisms+$1 WHERE id=$2', [PUZZLE_REWARD, profileId]);
      await sql('UPDATE daily_puzzle_runs SET rewarded=true WHERE day=$1 AND profile_id=$2', [
        day,
        profileId,
      ]);
    }
  }
  async claim(
    profileId: string,
    registered: boolean,
    input: Record<string, unknown>,
    accountId = profileId,
  ) {
    const day = this.checkDay(input.day);
    if (!registered)
      throw new GameError('Register or sign in to claim the daily puzzle reward.', 403);
    await this.db.tx((sql) => this.reward(sql, day, profileId, registered, accountId));
    return this.view(profileId, registered, accountId);
  }
  async move(
    profileId: string,
    registered: boolean,
    input: Record<string, unknown>,
    accountId = profileId,
  ) {
    const day = this.checkDay(input.day);
    await this.db.tx(async (sql) => {
      const [run] = await sql<Run>(
        'SELECT * FROM daily_puzzle_runs WHERE day=$1 AND profile_id=$2',
        [day, profileId],
      );
      if (!run) throw new GameError('Start the daily puzzle first.', 409);
      if (!Number.isInteger(input.version) || input.version !== run.version)
        throw new GameError('The puzzle has changed. Refresh before moving.', 409);
      if (typeof input.cardId !== 'string' || !Number.isInteger(input.cell))
        throw new GameError('Choose a card and an empty cell.');
      const move = { player: 0 as const, cardId: input.cardId, cell: input.cell as number };
      const error = validateMove(run.state, move);
      if (error) throw new GameError(error, 409);
      let state = applyMove(run.state, move);
      if (state.status === 'playing' && state.turn === 1) {
        const reply = bestPuzzleMove(state);
        if (reply) state = applyMove(state, reply);
      }
      const solved = state.status === 'complete' && winner(state) === 0;
      await sql(
        `UPDATE daily_puzzle_runs SET state=$1::jsonb,version=version+1,
        solved_at=CASE WHEN $2 AND solved_at IS NULL THEN now() ELSE solved_at END,
        solve_attempts=CASE WHEN $2 AND solved_at IS NULL THEN attempts ELSE solve_attempts END,
        elapsed_ms=CASE WHEN $2 AND solved_at IS NULL THEN greatest(0,floor(extract(epoch FROM (now()-started_at))*1000))::bigint ELSE elapsed_ms END
        WHERE day=$3 AND profile_id=$4`,
        [JSON.stringify(state), solved, day, profileId],
      );
      await this.reward(sql, day, profileId, registered, accountId);
    });
    return this.view(profileId, registered, accountId);
  }
}
