import { randomUUID, randomInt } from 'node:crypto';
import {
  chooseCpuMove,
  cpuView,
  randomDeck,
  seededRandom,
  STANDARD,
  type GameState,
} from '@gacha-triad/engine';
import { CARDS, STARTER_DECK, CPU_DECK } from '@gacha-triad/shared';
import type { Mode, PopulationView } from '@gacha-triad/shared/platform';
import { GameError, GameStore, type Actor } from './store';
import { Trades } from './trades';
const NAMES = [
  'Nova',
  'Mog',
  'Cobalt',
  'Rinoa',
  'Laguna',
  'Quistis',
  'Selphie',
  'Irvine',
  'Zell',
  'Seifer',
];
const MODES: Mode[] = [
  'custom',
  'custom',
  'casual',
  'ranked',
  'draft',
  'roulette',
  'custom',
  'custom',
  'custom',
  'custom',
];
export class BotPopulation {
  private closing = false;
  shutdown() {
    this.closing = true;
  }
  readonly available = process.env.LOCAL_BOTS === 'true' || process.env.NODE_ENV !== 'production';
  private next = new Map<string, number>();
  constructor(
    readonly store: GameStore,
    readonly trades: Trades,
  ) {}
  async status(): Promise<PopulationView> {
    return this.store.db.read(async (sql) => {
      const [e] = await sql<{ enabled: boolean }>(
        'SELECT enabled FROM local_population WHERE id=1',
      );
      const [n] = await sql<{ n: number }>('SELECT count(*)::int n FROM profiles WHERE is_bot');
      const [m] = await sql<{ n: number }>(
        "SELECT count(*)::int n FROM matches WHERE status IN('playing','drafting') AND (player0 IN(SELECT id FROM profiles WHERE is_bot) OR player1 IN(SELECT id FROM profiles WHERE is_bot))",
      );
      return {
        available: this.available,
        enabled: this.available && e.enabled,
        bots: n.n,
        activeGames: m.n,
      };
    });
  }
  async set(enabled: boolean) {
    if (!this.available && enabled)
      throw new GameError('Local bots are disabled on this server.', 403);
    if (enabled)
      for (let i = 0; i < NAMES.length; i++) {
        const id = `local-bot-${i}`;
        await this.store.db.read(async (sql) => {
          await sql(
            'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt","isAnonymous") VALUES($1,$2,$3,false,now(),now(),false) ON CONFLICT(id) DO NOTHING',
            [id, `[BOT] ${NAMES[i]}`, `bot-${i}@gacha-triad.invalid`],
          );
        });
        const p = await this.store.profile({ id, name: `[BOT] ${NAMES[i]}`, isAnonymous: false });
        await this.store.db.read((sql) =>
          sql('UPDATE profiles SET is_bot=true WHERE id=$1', [p.id]),
        );
        for (const pack of await this.store.economy.list(p.id))
          if (!pack.openedAt) await this.store.economy.open(p.id, pack.id);
      }
    await this.store.db.read((sql) =>
      sql('UPDATE local_population SET enabled=$1 WHERE id=1', [enabled]),
    );
    if (!enabled) {
      const bots = await this.actors();
      for (const actor of bots) {
        const p = await this.store.profile(actor);
        if (p.waitingLobbyId) await this.store.cancelLobby(p.id, p.waitingLobbyId);
        for (const offer of (await this.trades.list()).filter((o) => o.ownerId === p.id))
          await this.trades.cancel(p, offer.id);
      }
      // Existing duels keep their bot opponent until completion; only background population stops.
    }
    return this.status();
  }
  private async actors() {
    return this.store.db.read((sql) =>
      sql<Actor>(
        'SELECT DISTINCT u.id,u.name,false AS "isAnonymous" FROM "user" u JOIN profile_accounts a ON a.auth_user_id=u.id JOIN profiles p ON p.id=a.profile_id WHERE p.is_bot ORDER BY u.id',
      ),
    );
  }
  async tick() {
    if (this.closing) return false;
    const enabled = (await this.status()).enabled;
    const actors = await this.actors();
    let changed = false;
    for (let i = 0; i < actors.length; i++) {
      if (this.closing) break;
      const actor = actors[i];
      if ((this.next.get(actor.id) || 0) > Date.now()) continue;
      this.next.set(actor.id, Date.now() + 2200 + randomInt(1800));
      try {
        let p = await this.store.profile(actor);
        if (p.activeMatchId) {
          const m = await this.store.view(p.id, p.activeMatchId);
          if (m.status === 'drafting' && !m.draftLocked)
            await this.store.lockDraft(
              p.id,
              m.id,
              randomDeck(m.draftPool, seededRandom(randomInt(2 ** 32))).map((c) => c.id),
            );
          else if (m.game?.turn === m.seat && m.status === 'playing') {
            // Only the bot's hand and public board are passed to the same CPU policy as solo.
            const { hands, ...publicView } = m.game;
            const move = chooseCpuMove(
              { ...publicView, hand: hands[m.seat].flatMap((c) => (c.card ? [c.card] : [])) },
              'normal',
              seededRandom(randomInt(2 ** 32)),
            );
            if (move) await this.store.move(p.id, m.id, move.cardId, move.cell, m.version);
          }
          changed = true;
          continue;
        }
        const pending = await this.store.db.read((sql) =>
          sql<{ id: string }>(
            "SELECT id FROM matches WHERE status='complete' AND settlement_done=false AND ((winner=0 AND player0=$1) OR(winner=1 AND player1=$1))",
            [p.id],
          ),
        );
        for (const row of pending) {
          const m = await this.store.view(p.id, row.id);
          if (m.trade.choices[0]) await this.store.claimCard(p.id, row.id, m.trade.choices[0].id);
          changed = true;
        }
        if (!enabled) continue;
        // Leave two demonstration players available for joining user-created tables.
        const lobbies = await this.store.lobbies();
        const humanTable = lobbies.find(
          (l) =>
            l.status === 'waiting' &&
            !l.host.startsWith('[BOT]') &&
            Date.now() - Date.parse(l.createdAt) > 5000,
        );
        if (!p.waitingLobbyId && humanTable) {
          await this.store.joinLobby(p, humanTable.id);
          changed = true;
          continue;
        }
        if (!p.waitingLobbyId && i < 9) {
          try {
            await this.store.rebuildDeck(p.id);
          } catch {}
          p = await this.store.profile(actor);
          await this.store.createLobby(p, {
            mode: MODES[i],
            name: i === 8 ? '[BOT] Exhibition duel' : `[BOT] ${NAMES[i]}’s table`,
            rules: {
              ...STANDARD,
              allOpen: i % 2 === 0,
              same: true,
              plus: i % 2 === 0,
              combo: true,
              random: i === 0,
              elemental: i === 0,
            },
          });
          changed = true;
        }
        if (!p.waitingLobbyId && i === 9) {
          const table = lobbies.find(
            (l) => l.name === '[BOT] Exhibition duel' && l.status === 'waiting',
          );
          if (table) {
            await this.store.joinLobby(p, table.id);
            changed = true;
          }
        }
        const offers = await this.trades.list();
        if (offers.filter((o) => o.ownerId === p.id).length < 2) {
          const available = CARDS.filter(
            (c) => (p.inventory[c.id]?.available ?? 0) > 0 && !p.deck.includes(c.id),
          );
          if (available.length) {
            const offered = available[randomInt(available.length)],
              wanted = CARDS.filter(
                (c) => c.rarity === offered.rarity && c.id !== offered.id && !p.inventory[c.id],
              );
            const common = [...STARTER_DECK, ...CPU_DECK].filter(
              (c) => c.rarity === offered.rarity && c.id !== offered.id,
            );
            const ask =
              i % 2 === 0 && common.length
                ? common[randomInt(common.length)]
                : wanted.length
                  ? wanted[randomInt(wanted.length)]
                  : CARDS.find((c) => c.id !== offered.id)!;
            await this.trades.create(p, offered.id, ask.id);
            changed = true;
          }
        }
        // Bots also fulfil offers from local players if they hold the requested card.
        const offer = offers.find(
          (o) =>
            !o.owner.startsWith('[BOT]') &&
            Date.now() - Date.parse(o.createdAt) > 8000 &&
            (p.inventory[o.wanted.id]?.available ?? 0) > 0,
        );
        if (offer) {
          await this.trades.accept(p, offer.id);
          changed = true;
        }
      } catch (error) {
        if (!(error instanceof GameError)) throw error;
      }
    }
    return changed;
  }
}
