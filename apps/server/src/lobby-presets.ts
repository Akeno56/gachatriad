import { randomUUID } from 'node:crypto';
import { supportsTradeOne } from '@gacha-triad/engine';
import type { LobbyPreset } from '@gacha-triad/shared/platform';
import type { Database } from './database';
import { GameError } from './errors';
import { cleanRules, type ProfileIdentity } from './store';

export class LobbyPresets {
  constructor(readonly db: Database) {}

  list(profileId: string) {
    return this.db.read((sql) =>
      sql<LobbyPreset>(
        'SELECT id,name,rules,trade_rule AS "tradeRule",allow_bots AS "allowBots" FROM lobby_presets WHERE profile_id=$1 ORDER BY lower(name),name',
        [profileId],
      ),
    );
  }

  async save(profile: ProfileIdentity, input: Record<string, unknown>) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 40)
      throw new GameError('Enter a preset name of 1 to 40 characters.');
    const rules = cleanRules(input.rules);
    const tradeRule = input.tradeRule === 'one' ? 'one' : 'none';
    if (tradeRule === 'one' && (!profile.registered || !supportsTradeOne(rules)))
      throw new GameError('Trade One needs a registered account and Closed, Same, Plus and Combo.');
    const allowBots = input.allowBots === true;
    return this.db.tx(async (sql) => {
      const existing = await sql<{ id: string; name: string }>(
        'SELECT id,name FROM lobby_presets WHERE profile_id=$1',
        [profile.id],
      );
      const id = existing.find((row) => row.name === name)?.id;
      if (!id && existing.length >= 12)
        throw new GameError('You can save up to 12 lobby presets.', 409);
      const [preset] = await sql<LobbyPreset>(
        `INSERT INTO lobby_presets(id,profile_id,name,rules,trade_rule,allow_bots) VALUES($1,$2,$3,$4::jsonb,$5,$6)
         ON CONFLICT(profile_id,name) DO UPDATE SET rules=excluded.rules,trade_rule=excluded.trade_rule,allow_bots=excluded.allow_bots
         RETURNING id,name,rules,trade_rule AS "tradeRule",allow_bots AS "allowBots"`,
        [id ?? randomUUID(), profile.id, name, JSON.stringify(rules), tradeRule, allowBots],
      );
      return preset;
    });
  }

  async remove(profileId: string, id: string) {
    const deleted = await this.db.tx((sql) =>
      sql('DELETE FROM lobby_presets WHERE id=$1 AND profile_id=$2 RETURNING id', [id, profileId]),
    );
    if (!deleted.length) throw new GameError('Lobby preset not found.', 404);
    return { ok: true };
  }
}
