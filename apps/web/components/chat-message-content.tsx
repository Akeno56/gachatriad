import { LocaleView, NoTranslate, LocalizedDate } from './i18n';
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
    <LocaleView>
      <>
        <Avatar card={person.avatar} name={person.name} />
        <div className="message-content">
          <header className="message-heading">
            {person.id ? (
              <a href={appPath(`/profile?id=${person.id}`)} title={person.name} translate="no">
                <NoTranslate>{person.name}</NoTranslate>
              </a>
            ) : (
              <strong>
                <NoTranslate>{person.name}</NoTranslate>
              </strong>
            )}
            {person.title && <small className="message-title">{person.title}</small>}
          </header>
          {body !== undefined && (
            <p>
              <NoTranslate>{body}</NoTranslate>
            </p>
          )}
          {createdAt && (
            <time className="message-time" dateTime={createdAt}>
              <LocalizedDate
                value={createdAt}
                format="time"
                options={{ hour: '2-digit', minute: '2-digit' }}
              />
            </time>
          )}
        </div>
      </>
    </LocaleView>
  );
}
