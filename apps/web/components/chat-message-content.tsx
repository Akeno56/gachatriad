import type { BattleIdentity } from '@gacha-triad/shared/social';
import { Avatar } from './avatar';
import { appPath } from '../lib/connection';
export function ChatMessageContent({
  person,
  createdAt,
  body,
}: {
  person: BattleIdentity;
  createdAt?: string;
  body?: string;
}) {
  return (
    <>
      <Avatar card={person.avatar} name={person.name} />
      <div className="message-content">
        <header className="message-heading">
          {person.id ? (
            <a href={appPath(`/profile?id=${person.id}`)}>{person.name}</a>
          ) : (
            <strong>{person.name}</strong>
          )}
          {createdAt && (
            <time dateTime={createdAt}>
              {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
          )}
          {person.title && <small className="message-title">{person.title}</small>}
        </header>
        {body !== undefined && <p>{body}</p>}
      </div>
    </>
  );
}
