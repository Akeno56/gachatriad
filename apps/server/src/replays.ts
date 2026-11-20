import type { Card, GameState, Player, CpuStyle } from '@gacha-triad/engine';
import { ALL_CARDS } from '@gacha-triad/shared';
import type { Mode } from '@gacha-triad/shared/platform';
import type {
  ReplayData,
  ReplayEntry,
  ReplayFrame,
  ReplayList,
  ReplayView,
} from '@gacha-triad/shared/replays';
import type { Database, Sql } from './database';
import { GameError } from './errors';
const byId = new Map(ALL_CARDS.map((card) => [card.id, card]));
const modes = [
  'solo',
  'casual',
  'custom',
  'ranked',
  'ranked-random',
  'draft',
  'shared-draft',
  'roulette',
];
interface Row {
  id: string;
  mode: Mode;
  season: number;
  player0: string;
  player1: string | null;
  state: GameState | null;
  decks: [string[], string[]];
  rules: GameState['rules'];
  winner: Player | null;
  is_draw: boolean;
  end_reason: string | null;
  completed_at: Date;
  difficulty: string | null;
  cpu_style: CpuStyle;
  trade_rule: 'none' | 'one';
  settlement_done: boolean;
  claimed_card: string | null;
}
/** Reverse recorded captures rather than replaying the current rules engine. */
export function replayFrames(state: GameState | null, decks: [Card[], Card[]]): ReplayFrame[] {
  let board: ReplayFrame['board'] = state
    ? state.board.map((slot) =>
        slot
          ? { cardId: slot.card.id, owner: slot.owner, originalOwner: slot.originalOwner }
          : null,
      )
    : Array(9).fill(null);
  let hands: [string[], string[]] = state
    ? [state.hands[0].map((card) => card.id), state.hands[1].map((card) => card.id)]
    : [decks[0].map((card) => card.id), decks[1].map((card) => card.id)];
  const history = state?.history ?? [],
    frames: ReplayFrame[] = [];
  for (let step = history.length; step >= 0; step--) {
    const action = history[step - 1];
    const score: [number, number] = [hands[0].length, hands[1].length];
    for (const slot of board) if (slot) score[slot.owner]++;
    frames.unshift({
      board: structuredClone(board),
      hands: structuredClone(hands),
      turn: step ? ((1 - action.move.player) as Player) : (state?.firstPlayer ?? 0),
      move: action ? { ...action.move } : null,
      captures: action ? structuredClone([...action.captures]) : [],
      score,
    });
    if (!action) break;
    for (const capture of [...action.captures].reverse()) {
      const slot = board[capture.cell];
      if (slot) board[capture.cell] = { ...slot, owner: capture.from };
    }
    board[action.move.cell] = null;
    hands[action.move.player] = [...hands[action.move.player], action.move.cardId];
    const order = decks[action.move.player].map((card) => card.id);
    hands[action.move.player].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  return frames;
}
export async function archiveReplay(sql: Sql, id: string) {
  if ((await sql('SELECT 1 FROM match_replays WHERE match_id=$1', [id])).length) return;
  const [m] = await sql<Row>("SELECT * FROM matches WHERE id=$1 AND status='complete'", [id]);
  if (!m) return;
  const people = await sql<{
    id: string;
    name: string;
    avatar_card: string | null;
    is_bot: boolean;
    bot_style: CpuStyle;
  }>('SELECT id,name,avatar_card,is_bot,bot_style FROM profiles WHERE id=$1 OR id=$2', [
    m.player0,
    m.player1,
  ]);
  const definitions = new Map<string, Card>();
  for (const card of [
    ...(m.state?.hands.flat() ?? []),
    ...(m.state?.board.flatMap((slot) => (slot ? [slot.card] : [])) ?? []),
  ])
    definitions.set(card.id, card);
  const decks: [Card[], Card[]] = [
    m.decks[0].flatMap((id) => definitions.get(id) ?? byId.get(id) ?? []),
    m.decks[1].flatMap((id) => definitions.get(id) ?? byId.get(id) ?? []),
  ];
  const audits = await sql<{ profile_id: string; before_rating: number; after_rating: number }>(
    'SELECT * FROM match_ratings WHERE match_id=$1',
    [id],
  );
  const players = [m.player0, m.player1].map((id) => {
    const p = people.find((p) => p.id === id);
    return {
      name: p?.name ?? (m.difficulty === 'normal' ? 'The Strategist' : 'The Wanderer'),
      avatar: p?.avatar_card ? (byId.get(p.avatar_card) ?? null) : null,
      botStyle: p?.is_bot ? p.bot_style : !id && m.mode === 'solo' ? m.cpu_style : null,
    };
  }) as ReplayData['players'];
  const payload: ReplayData = {
    id,
    mode: m.mode,
    season: m.season,
    completedAt: new Date(m.completed_at).toISOString(),
    players,
    decks,
    rules: m.rules,
    cellElements: [...(m.state?.cellElements ?? Array(9).fill(null))],
    revealed: m.state?.revealed,
    frames: replayFrames(m.state, decks),
    winner: m.is_draw ? 'draw' : (m.winner ?? 0),
    endReason: m.end_reason,
    ratings: [m.player0, m.player1].map((id) => {
      const a = audits.find((a) => a.profile_id === id);
      return a ? { before: a.before_rating, after: a.after_rating } : null;
    }),
    tradeRule: m.trade_rule,
    tradePending: !m.settlement_done,
    claimedCardId: m.claimed_card,
  };
  await sql(
    'INSERT INTO match_replays(match_id,payload) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',
    [id, JSON.stringify(payload)],
  );
  for (const [seat, profileId] of [m.player0, m.player1].entries())
    if (
      profileId &&
      !people.find((p) => p.id === profileId)?.is_bot &&
      profileId !== 'former-guest'
    )
      await sql(
        'INSERT INTO replay_owners(match_id,profile_id,seat) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [id, profileId, seat],
      );
}
export async function anonymizeReplays(sql: Sql, profiles: string[]) {
  const rows = await sql<{ match_id: string; seat: number }>(
    'SELECT match_id,seat FROM replay_owners WHERE profile_id=ANY($1::text[])',
    [profiles],
  );
  for (const row of rows)
    await sql(
      'UPDATE match_replays SET payload=jsonb_set(payload,$1::text[],$2::jsonb) WHERE match_id=$3',
      [
        ['players', String(row.seat)],
        JSON.stringify({ name: 'Deleted player', avatar: null, botStyle: null }),
        row.match_id,
      ],
    );
}
export class MatchReplays {
  constructor(readonly db: Database) {}
  private async owned(sql: Sql, profileId: string, id: string): Promise<ReplayView> {
    const [match] = await sql<{ revealed: GameState['revealed'] | null }>(
      "SELECT state->'revealed' AS revealed FROM matches WHERE id=$1 AND status='complete' AND (player0=$2 OR player1=$2)",
      [id, profileId],
    );
    if (!match) throw new GameError('Replay not found.', 404);
    await archiveReplay(sql, id);
    const [row] = await sql<{ payload: ReplayData; seat: Player; favorite: boolean }>(
      'SELECT r.payload,o.seat,o.favorite FROM match_replays r JOIN replay_owners o ON o.match_id=r.match_id WHERE r.match_id=$1 AND o.profile_id=$2',
      [id, profileId],
    );
    if (!row) throw new GameError('Replay not found.', 404);
    return {
      ...row.payload,
      revealed: row.payload.revealed ?? match.revealed ?? undefined,
      seat: row.seat,
      favorite: row.favorite,
    };
  }
  async get(profileId: string, id: string) {
    return this.db.tx((sql) => this.owned(sql, profileId, id));
  }
  async favorite(profileId: string, id: string, value: unknown) {
    if (typeof value !== 'boolean') throw new GameError('Choose a favourite setting.');
    return this.db.tx(async (sql) => {
      await this.owned(sql, profileId, id);
      await sql('UPDATE replay_owners SET favorite=$1 WHERE profile_id=$2 AND match_id=$3', [
        value,
        profileId,
        id,
      ]);
      return { favorite: value };
    });
  }
  async list(
    profileId: string,
    query: { mode?: string; offset?: string; favorites?: string },
  ): Promise<ReplayList> {
    const offset = Number(query.offset ?? 0),
      mode = query.mode ?? 'all';
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      (mode !== 'all' && !modes.includes(mode))
    )
      throw new GameError('Invalid replay filter.');
    if (query.favorites !== undefined && !['true', 'false'].includes(query.favorites))
      throw new GameError('Invalid replay filter.');
    const favorite = query.favorites === 'true';
    return this.db.tx(async (sql) => {
      const where =
        "m.status='complete' AND (m.player0=$1 OR m.player1=$1) AND ($2='all' OR m.mode=$2) AND (NOT $3 OR o.favorite=true)";
      const params = [profileId, mode, favorite];
      const [count] = await sql<{ total: number }>(
        `SELECT count(*)::int total FROM matches m LEFT JOIN replay_owners o ON o.match_id=m.id AND o.profile_id=$1 WHERE ${where}`,
        params,
      );
      const rows = await sql<{
        id: string;
        payload: ReplayData | null;
        seat: Player | null;
        favorite: boolean | null;
      }>(
        `SELECT m.id,r.payload,o.seat,o.favorite FROM matches m LEFT JOIN replay_owners o ON o.match_id=m.id AND o.profile_id=$1 LEFT JOIN match_replays r ON r.match_id=m.id WHERE ${where} ORDER BY m.completed_at DESC,m.id DESC LIMIT 20 OFFSET $4`,
        [...params, offset],
      );
      const result: ReplayEntry[] = [];
      for (const row of rows) {
        const replay =
            row.payload && row.seat !== null
              ? { ...row.payload, seat: row.seat, favorite: row.favorite ?? false }
              : await this.owned(sql, profileId, row.id),
          score = replay.frames.at(-1)!.score,
          rating = replay.ratings[replay.seat];
        result.push({
          id: replay.id,
          mode: replay.mode,
          completedAt: replay.completedAt,
          opponent: replay.players[1 - replay.seat],
          result:
            replay.winner === 'draw' ? 'draw' : replay.winner === replay.seat ? 'win' : 'loss',
          score: [score[replay.seat], score[1 - replay.seat]],
          turns: replay.frames.length - 1,
          endReason: replay.endReason,
          ratingDelta: rating ? rating.after - rating.before : null,
          favorite: replay.favorite,
        });
      }
      return { rows: result, total: count.total, offset, limit: 20 };
    });
  }
}
