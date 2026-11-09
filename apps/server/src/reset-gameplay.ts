import type { GameStore } from './store';
/** Offline maintenance only; deliberately not exposed by a web route. */
export async function resetGameplay(store: GameStore, version = 'v0.12-holo-starters') {
  return store.db.tx(async (sql) => {
    if ((await sql('SELECT 1 FROM gameplay_resets WHERE version=$1', [version])).length)
      return { applied: false };
    await sql(`TRUNCATE TABLE duel_invitations,friend_messages,friendships,chat_messages,battle_messages,chat_moderation_state,
      trade_offers,inventory_ledger,achievement_unlocks,lobbies,match_ratings,matches,inventory,
      prism_ledger,booster_purchases,booster_packs,duplicate_actions,card_purchases,admin_grants,moderation_log`);
    await sql(`UPDATE profiles SET rating=1000,draft_rating=1000,peak_rating=1000,
      wins=0,losses=0,draws=0,played=0,captures=0,same_captures=0,plus_captures=0,
      combo_captures=0,best_combo=0,perfect_wins=0,trade_wins=0,prisms=0,
      default_deck='[]',avatar_card=NULL,selected_title=NULL,best_ranked_position=NULL,
      tutorial_completed=false,ranked_acknowledged=false,starter_granted=true,last_seen_at=now()`);
    await sql('UPDATE local_population SET enabled=false WHERE id=1');
    const players = await sql<{ id: string }>(
      'SELECT DISTINCT p.id FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id WHERE a.auth_user_id IS NOT NULL',
    );
    for (const player of players) await store.economy.grantStarter(sql, player.id);
    await sql('INSERT INTO gameplay_resets(version) VALUES($1)', [version]);
    return { applied: true, profilesReset: players.length, starterBoosters: players.length * 3 };
  });
}
