import { randomUUID } from 'node:crypto';
import { ALL_CARDS } from '@gacha-triad/shared';
import { CHAT_CHANNELS, type ChatChannel } from '@gacha-triad/shared/social';
import type {
  BattleIdentity,
  ChatMessage,
  DuelInvitation,
  FriendView,
  FriendMessage,
  FriendConversation,
  LadderEntry,
  SocialView,
} from '@gacha-triad/shared/social';
import type { ProfileView } from '@gacha-triad/shared/platform';
import type { GameStore } from './store';
import type { Sql } from './database';
import { GameError } from './errors';
import { titleName } from './titles';
interface Person {
  id: string;
  name: string;
  avatar_card: string | null;
  selected_title: string | null;
}
const cards = new Map(ALL_CARDS.map((c) => [c.id, c]));
function identity(p: Person): BattleIdentity {
  return {
    id: p.id,
    name: p.name,
    title: titleName(p.selected_title),
    avatar: p.avatar_card ? (cards.get(p.avatar_card) ?? null) : null,
  };
}
function registered(p: ProfileView) {
  if (!p.registered)
    throw new GameError('Register an account to use friends, invitations and chat.', 403);
}
export class Social {
  constructor(readonly store: GameStore) {}
  private async requireFriend(sql: Sql, p: ProfileView, target: string) {
    registered(p);
    await this.eligible(sql, target);
    if (
      !(
        await sql(
          "SELECT 1 FROM friendships WHERE profile_a=$1 AND profile_b=$2 AND status='accepted'",
          [p.id, target].sort(),
        )
      ).length
    )
      throw new GameError('Private chat is available between accepted friends.', 403);
  }
  async messages(p: ProfileView, target: string): Promise<FriendMessage[]> {
    return this.store.db.read(async (sql) => {
      await this.requireFriend(sql, p, target);
      const rows = await sql<{
        id: string;
        sender_id: string;
        recipient_id: string;
        body: string;
        created_at: Date;
      }>(
        `SELECT * FROM friend_messages WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1) ORDER BY created_at DESC,id DESC LIMIT 80`,
        [p.id, target],
      );
      return rows.reverse().map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        recipientId: m.recipient_id,
        body: m.body,
        createdAt: m.created_at.toISOString(),
      }));
    });
  }
  async readMessages(p: ProfileView, target: string, through: unknown) {
    if (typeof through !== 'string')
      throw new GameError('Choose the last message to mark as read.');
    await this.store.db.tx(async (sql) => {
      await this.requireFriend(sql, p, target);
      await sql(
        `UPDATE friend_messages SET read_at=now() WHERE recipient_id=$1 AND sender_id=$2 AND read_at IS NULL AND created_at <= (SELECT created_at FROM friend_messages WHERE id=$3 AND recipient_id=$1 AND sender_id=$2)`,
        [p.id, target, through],
      );
    });
  }
  async postFriend(p: ProfileView, target: string, message: unknown, requestId: unknown) {
    const text = this.messageText(message, requestId);
    return this.store.db.tx(async (sql) => {
      await this.requireFriend(sql, p, target);
      const [previous] = await sql<{ id: string; recipient_id: string }>(
        'SELECT id,recipient_id FROM friend_messages WHERE sender_id=$1 AND request_id=$2',
        [p.id, requestId],
      );
      if (previous) {
        if (previous.recipient_id !== target)
          throw new GameError('This request ID belongs to another conversation.', 409);
        return { id: previous.id };
      }
      if (
        (
          await sql(
            "SELECT 1 FROM friend_messages WHERE sender_id=$1 AND created_at>now()-interval '3 seconds'",
            [p.id],
          )
        ).length
      )
        throw new GameError('Wait three seconds between messages.', 429);
      const id = randomUUID();
      await sql(
        'INSERT INTO friend_messages(id,sender_id,recipient_id,body,request_id) VALUES($1,$2,$3,$4,$5)',
        [id, p.id, target, text, requestId],
      );
      return { id };
    });
  }
  private messageText(message: unknown, requestId: unknown) {
    if (
      typeof message !== 'string' ||
      typeof requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)
    )
      throw new GameError('Enter a message and a valid request ID.');
    const text = message.trim();
    if (!text.length || text.length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
      throw new GameError('Messages must contain 1–300 printable characters.');
    return text;
  }
  private async eligible(sql: Sql, id: string) {
    const [p] = await sql<Person>(
      `SELECT p.* FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id AND a.is_primary
      JOIN "user" u ON u.id=a.auth_user_id LEFT JOIN server_suspensions s ON s.auth_user_id=u.id
      WHERE p.id=$1 AND NOT p.is_bot AND NOT coalesce(u."isAnonymous",false) AND s.auth_user_id IS NULL`,
      [id],
    );
    if (!p) throw new GameError('Choose an active registered player.', 404);
    return p;
  }
  async search(p: ProfileView, query: unknown): Promise<BattleIdentity[]> {
    registered(p);
    if (typeof query !== 'string' || query.trim().length < 2) return [];
    return this.store.db.read(async (sql) =>
      (
        await sql<Person>(
          `SELECT DISTINCT p.* FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id AND a.is_primary
      JOIN "user" u ON u.id=a.auth_user_id LEFT JOIN server_suspensions s ON s.auth_user_id=u.id
      WHERE p.id<>$1 AND NOT p.is_bot AND NOT coalesce(u."isAnonymous",false) AND s.auth_user_id IS NULL AND (p.name ILIKE $2 OR p.id=$3) ORDER BY p.name,p.id LIMIT 20`,
          [p.id, `%${query.trim().slice(0, 60)}%`, query.trim()],
        )
      ).map(identity),
    );
  }
  async friend(p: ProfileView, target: unknown, action: 'request' | 'accept' | 'remove') {
    registered(p);
    if (typeof target !== 'string' || target === p.id)
      throw new GameError('Choose another player.');
    const pair = [p.id, target].sort();
    await this.store.db.tx(async (sql) => {
      if (action !== 'remove') await this.eligible(sql, target);
      const [row] = await sql<{ requested_by: string; status: string }>(
        'SELECT * FROM friendships WHERE profile_a=$1 AND profile_b=$2',
        pair,
      );
      if (action === 'remove') {
        await sql('DELETE FROM friendships WHERE profile_a=$1 AND profile_b=$2', pair);
        return;
      }
      if (action === 'request') {
        if (row)
          throw new GameError(
            row.status === 'accepted'
              ? 'You are already friends.'
              : 'A friend request already exists.',
            409,
          );
        await sql('INSERT INTO friendships(profile_a,profile_b,requested_by) VALUES($1,$2,$3)', [
          ...pair,
          p.id,
        ]);
        return;
      }
      if (!row || row.status !== 'pending' || row.requested_by === p.id)
        throw new GameError('No incoming friend request from this player.', 409);
      await sql(
        "UPDATE friendships SET status='accepted' WHERE profile_a=$1 AND profile_b=$2",
        pair,
      );
    });
  }
  async post(p: ProfileView, message: unknown, requestId: unknown, channel: unknown = 'general') {
    registered(p);
    if (!CHAT_CHANNELS.includes(channel as ChatChannel))
      throw new GameError('Choose General, Trade or Lobbies chat.');
    const text = this.messageText(message, requestId);
    return this.store.db.tx(async (sql) => {
      const [previous] = await sql<{ id: string; channel: string; body: string }>(
        'SELECT id,channel,body FROM chat_messages WHERE profile_id=$1 AND request_id=$2',
        [p.id, requestId],
      );
      if (previous) {
        if (previous.channel !== channel || previous.body !== text)
          throw new GameError('This send request belongs to another message.', 409);
        return { id: previous.id };
      }
      if (
        (
          await sql(
            "SELECT 1 FROM chat_messages WHERE profile_id=$1 AND created_at>now()-interval '3 seconds'",
            [p.id],
          )
        ).length
      )
        throw new GameError('Wait three seconds between messages.', 429);
      const id = randomUUID();
      await sql(
        'INSERT INTO chat_messages(id,profile_id,body,request_id,channel) VALUES($1,$2,$3,$4,$5)',
        [id, p.id, text, requestId, channel],
      );
      return { id };
    });
  }
  async deleteMessage(p: ProfileView, id: string) {
    if (!p.isAdmin) throw new GameError('Administrator access required.', 403);
    await this.store.db.tx(async (sql) => {
      if (
        !(await sql('UPDATE chat_messages SET deleted=true WHERE id=$1 RETURNING id', [id])).length
      )
        throw new GameError('Message not found.', 404);
      await sql(
        "INSERT INTO moderation_log(id,auth_user_id,action,reason) SELECT $1,auth_user_id,'remove-chat',$2 FROM profile_accounts WHERE profile_id=$3 AND is_primary",
        [randomUUID(), `Message ${id}`, p.id],
      );
    });
  }
  async expire(sql: Sql) {
    await sql(
      "UPDATE duel_invitations SET status='expired' WHERE status='pending' AND (expires_at<=now() OR EXISTS(SELECT 1 FROM lobbies l WHERE l.id=lobby_id AND l.status='closed'))",
    );
    await sql(
      "UPDATE lobbies SET status='closed' WHERE status='waiting' AND invited_profile IS NOT NULL AND EXISTS(SELECT 1 FROM duel_invitations d WHERE d.lobby_id=lobbies.id AND d.status IN('expired','declined'))",
    );
  }
  async view(p: ProfileView, online: Set<string>): Promise<SocialView> {
    return this.store.db.tx(async (sql) => {
      await this.expire(sql);
      const friends = await sql<Person & { status: string; requested_by: string }>(
        `SELECT p.*,f.status,f.requested_by FROM friendships f JOIN profiles p ON p.id=CASE WHEN f.profile_a=$1 THEN f.profile_b ELSE f.profile_a END WHERE f.profile_a=$1 OR f.profile_b=$1 ORDER BY f.created_at DESC`,
        [p.id],
      );
      const onlinePlayers = (
        await sql<Person>(
          'SELECT id,name,avatar_card,selected_title FROM profiles WHERE id=ANY($1::text[]) ORDER BY name,id LIMIT 200',
          [[...online]],
        )
      ).map(identity);
      const chat = await sql<
        Person & { message_id: string; body: string; created_at: Date; channel: ChatChannel }
      >(
        `SELECT p.id,p.name,p.avatar_card,p.selected_title,m.id AS message_id,m.body,m.created_at,m.channel
         FROM (SELECT *,row_number() OVER(PARTITION BY channel ORDER BY created_at DESC,id DESC) AS position FROM chat_messages WHERE NOT deleted) m
         JOIN profiles p ON p.id=m.profile_id WHERE m.position<=80 ORDER BY m.created_at DESC,m.id`,
      );
      const conversations = p.registered
        ? await sql<{ player_id: string; body: string; created_at: Date; unread: number }>(
            `SELECT DISTINCT ON (thread.player_id) thread.* FROM (
          SELECT CASE WHEN m.sender_id=$1 THEN m.recipient_id ELSE m.sender_id END AS player_id,m.body,m.created_at,m.id,
          count(*) FILTER(WHERE m.recipient_id=$1 AND m.read_at IS NULL) OVER(PARTITION BY least(m.sender_id,m.recipient_id),greatest(m.sender_id,m.recipient_id))::int AS unread
          FROM friend_messages m JOIN friendships f ON f.profile_a=least(m.sender_id,m.recipient_id) AND f.profile_b=greatest(m.sender_id,m.recipient_id) AND f.status='accepted'
          WHERE m.sender_id=$1 OR m.recipient_id=$1
        ) thread ORDER BY thread.player_id,thread.created_at DESC,thread.id DESC`,
            [p.id],
          )
        : [];
      const pending = await sql<{
        id: string;
        sender_id: string;
        recipient_id: string;
        lobby_id: string;
        expires_at: Date;
      }>(
        "SELECT * FROM duel_invitations WHERE status='pending' AND (sender_id=$1 OR recipient_id=$1) ORDER BY created_at DESC LIMIT 20",
        [p.id],
      );
      const invitations: DuelInvitation[] = [];
      for (const invitation of pending) {
        const people = await sql<Person>('SELECT * FROM profiles WHERE id=$1 OR id=$2', [
          invitation.sender_id,
          invitation.recipient_id,
        ]);
        invitations.push({
          id: invitation.id,
          sender: identity(people.find((p) => p.id === invitation.sender_id)!),
          recipient: identity(people.find((p) => p.id === invitation.recipient_id)!),
          lobbyId: invitation.lobby_id,
          expiresAt: invitation.expires_at.toISOString(),
        });
      }
      return {
        onlinePlayers,
        conversations: conversations.map((c) => ({
          playerId: c.player_id,
          lastMessage: c.body,
          lastAt: c.created_at.toISOString(),
          unread: c.unread,
        })) as FriendConversation[],
        friends: friends.map((f) => ({
          ...identity(f),
          id: f.id,
          online: online.has(f.id),
          status:
            f.status === 'accepted' ? 'friend' : f.requested_by === p.id ? 'outgoing' : 'incoming',
        })) as FriendView[],
        chat: chat.reverse().map((m) => ({
          ...identity(m),
          id: m.message_id,
          playerId: m.id,
          body: m.body,
          channel: m.channel,
          createdAt: m.created_at.toISOString(),
        })) as ChatMessage[],
        invitations,
      };
    });
  }
  async invite(p: ProfileView, target: unknown) {
    registered(p);
    if (typeof target !== 'string' || target === p.id) throw new GameError('Choose a friend.');
    await this.store.db.read(async (sql) => {
      await this.eligible(sql, target);
      const pair = [p.id, target].sort();
      if (
        !(
          await sql(
            "SELECT 1 FROM friendships WHERE profile_a=$1 AND profile_b=$2 AND status='accepted'",
            pair,
          )
        ).length
      )
        throw new GameError('Add this player as a friend before inviting them.', 403);
    });
    const lobby = await this.store.createLobby(p, {
      mode: 'custom',
      name: `${p.name} · Friend invitation`,
      allowBots: false,
      invitedProfile: target,
    });
    try {
      const id = randomUUID();
      await this.store.db.tx((sql) =>
        sql(
          "INSERT INTO duel_invitations(id,sender_id,recipient_id,lobby_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
          [id, p.id, target, lobby.lobbyId],
        ),
      );
      return { id, lobbyId: lobby.lobbyId };
    } catch (e) {
      await this.store.cancelLobby(p.id, lobby.lobbyId);
      throw e;
    }
  }
  async respond(p: ProfileView, id: string, accept: boolean) {
    registered(p);
    await this.store.db.tx((sql) => this.expire(sql));
    const row = await this.store.db.tx(async (sql) => {
      const [invitation] = await sql<{
        status: string;
        sender_id: string;
        recipient_id: string;
        lobby_id: string;
      }>('SELECT * FROM duel_invitations WHERE id=$1', [id]);
      if (!invitation || ![invitation.sender_id, invitation.recipient_id].includes(p.id))
        throw new GameError('Invitation not found.', 404);
      if (invitation.status === 'accepted' && accept) {
        if (invitation.recipient_id !== p.id)
          throw new GameError('Only the invited player may accept.', 403);
        return invitation;
      }
      if (invitation.status !== 'pending') throw new GameError('This invitation has ended.', 409);
      if (accept && invitation.recipient_id !== p.id)
        throw new GameError('Only the invited player may accept.', 403);
      if (!accept) await sql("UPDATE duel_invitations SET status='declined' WHERE id=$1", [id]);
      return invitation;
    });
    if (!accept) {
      await this.store.cancelLobby(row.sender_id, row.lobby_id);
      return { matchId: null };
    }
    let result;
    try {
      result = await this.store.joinLobby(p, row.lobby_id);
    } catch (e) {
      const [existing] = await this.store.db.read((sql) =>
        sql<{ guest_id: string; match_id: string }>(
          'SELECT guest_id,match_id FROM lobbies WHERE id=$1',
          [row.lobby_id],
        ),
      );
      if (existing?.guest_id !== p.id || !existing.match_id) throw e;
      result = { matchId: existing.match_id };
    }
    await this.store.db.read((sql) =>
      sql("UPDATE duel_invitations SET status='accepted' WHERE id=$1", [id]),
    );
    return result;
  }
  async ladder(mode: unknown): Promise<LadderEntry[]> {
    const kind = mode === 'draft' ? 'draft' : 'ranked',
      rating = kind === 'draft' ? 'draft_rating' : 'rating';
    return this.store.db.read(async (sql) =>
      (
        await sql<Person & { rating: number; games: number; wins: number; draws: number }>(
          `SELECT p.id,p.name,p.avatar_card,p.selected_title,p.${rating} AS rating,
      count(m.id)::int AS games,count(m.id) FILTER(WHERE (m.winner=0 AND m.player0=p.id) OR(m.winner=1 AND m.player1=p.id))::int AS wins,
      count(m.id) FILTER(WHERE m.is_draw)::int AS draws FROM profiles p
      JOIN profile_accounts a ON a.profile_id=p.id AND a.is_primary JOIN "user" u ON u.id=a.auth_user_id
      LEFT JOIN server_suspensions s ON s.auth_user_id=u.id
      JOIN matches m ON (m.player0=p.id OR m.player1=p.id) AND m.mode=$1 AND m.status='complete'
      WHERE NOT p.is_bot AND NOT coalesce(u."isAnonymous",false) AND s.auth_user_id IS NULL
      GROUP BY p.id ORDER BY p.${rating} DESC,count(m.id) DESC,p.name,p.id LIMIT 100`,
          [kind],
        )
      ).map((p, index) => ({
        ...identity(p),
        id: p.id,
        rank: index + 1,
        rating: p.rating,
        games: p.games,
        wins: p.wins,
        draws: p.draws,
      })),
    );
  }
}
