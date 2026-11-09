import { randomUUID } from 'node:crypto';
import type { Database } from './database';
import { GameError } from './errors';

/** Local, deterministic EN/FR moderation. No messages are sent to an external service. */
export function normalizeChat(text: string) {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/(?<=[a-z])!(?=[a-z])/g, 'i')
    .replace(
      /[013457@$]/g,
      (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' })[c]!,
    )
    .replace(/(.)\1{2,}/gu, '$1$1');
}
const forbidden = [
  'fuck',
  'fucking',
  'fucker',
  'motherfucker',
  'bitch',
  'asshole',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retarded',
  'kys',
  'putain',
  'pute',
  'putes',
  'salope',
  'salopes',
  'connard',
  'connasse',
  'encule',
  'encules',
  'fdp',
  'ntm',
  'pd',
  'tarlouze',
  'negre',
  'negres',
];
const abuse = forbidden.map(
  (word) => new RegExp(`(?:^|[^a-z])${word.split('').join('[\\s._*\\-]*')}(?:$|[^a-z])`, 'u'),
);
export function chatViolation(text: string): string | null {
  const normal = normalizeChat(text);
  const words = normal.replace(/[._*'’\-]+/g, ' ').replace(/\s+/g, ' ');
  if (
    abuse.some((rule) => rule.test(normal)) ||
    /\b(kill yourself|go die|va mourir|suicide toi|je vais te tuer|i will kill you|fils de pute|you retard|you are a retard)\b/.test(
      words,
    )
  )
    return 'abuse';
  if (/(.)\1{14,}/u.test(text) || /\b(\w+)(?:\s+\1){7,}\b/iu.test(text)) return 'spam';
  if (
    /(?:javascript|data|file):|https?:\/\/\S+\.(?:exe|scr|bat|cmd|ps1)(?:[?#\s]|$)/i.test(text) ||
    /\b(?:send|give|share) (?:me )?(?:your )?(?:password|login code|recovery code)\b|\b(?:envoie|donne|partage)(?: moi)? (?:ton |votre )?(?:mot de passe|code de connexion|code de recuperation)\b/.test(
      normal,
    )
  )
    return 'unsafe links or credential requests';
  return null;
}
const blocked =
  'Message blocked by automatic moderation. Keep chat respectful and avoid spam or unsafe links.';
const muted = 'Chat is temporarily muted for 10 minutes after repeated moderation violations.';
export class ChatFilter {
  constructor(readonly db: Database) {}
  async check(profileId: string, text: string) {
    // Commit strike/mute state even though the caller rejects the message afterwards.
    const error = await this.db.tx(async (sql) => {
      const now = Date.now();
      const [state] = await sql<{ strikes: number; window_started: string; muted_until: string }>(
        'SELECT * FROM chat_moderation_state WHERE profile_id=$1',
        [profileId],
      );
      if (state && Number(state.muted_until) > now) return muted;
      let violation = chatViolation(text);
      if (!violation) {
        const recent = await sql<{ body: string }>(
          `SELECT body FROM (
            SELECT body,created_at FROM chat_messages WHERE profile_id=$1
            UNION ALL SELECT body,created_at FROM friend_messages WHERE sender_id=$1
            UNION ALL SELECT body,created_at FROM battle_messages WHERE sender_id=$1
          ) messages WHERE created_at>now()-interval '30 seconds' ORDER BY created_at DESC LIMIT 6`,
          [profileId],
        );
        if (
          recent.length >= 5 ||
          recent.filter((m) => normalizeChat(m.body) === normalizeChat(text)).length >= 2
        )
          violation = 'spam';
      }
      if (!violation) return null;
      const fresh = !state || now - Number(state.window_started) >= 600000;
      const strikes = fresh ? 1 : state.strikes + 1;
      const until = strikes >= 3 ? now + 600000 : 0;
      await sql(
        `INSERT INTO chat_moderation_state(profile_id,strikes,window_started,muted_until) VALUES($1,$2,$3,$4)
        ON CONFLICT(profile_id) DO UPDATE SET strikes=excluded.strikes,window_started=excluded.window_started,muted_until=excluded.muted_until`,
        [profileId, strikes, fresh ? now : Number(state!.window_started), until],
      );
      await sql(
        `INSERT INTO moderation_log(id,auth_user_id,action,reason)
        SELECT $1,auth_user_id,$2,$3 FROM profile_accounts WHERE profile_id=$4 AND is_primary`,
        [randomUUID(), until ? 'auto-chat-mute' : 'auto-chat-block', violation, profileId],
      );
      return until ? muted : blocked;
    });
    if (error) throw new GameError(error, 429);
  }
}
