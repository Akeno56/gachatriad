import { LocaleView, NoTranslate, LocalizedDate } from './i18n';
import { BATTLE_STAMPS, type BattleIdentity, type BattleStampId } from '@gacha-triad/shared/social';
import { Avatar } from './avatar';
import { appPath } from '../lib/connection';
export function ChatMessageContent({
  person,
  createdAt,
  body,
  stampId,
}: {
  person: BattleIdentity;
  createdAt?: string;
  body?: string;
  stampId?: BattleStampId | null;
}) {
  const stamp = stampId && BATTLE_STAMPS.find(({ id }) => id === stampId);
  return (
    <LocaleView>
      <>
        <Avatar card={person.avatar} frameId={person.frameId} name={person.name} />
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
          {stamp ? (
            <p className="battle-stamp-message" data-stamp={stamp.id}>
              <span className="battle-stamp-mark" aria-hidden="true">
                {stamp.mark}
              </span>
              <span>{stamp.label}</span>
            </p>
          ) : (
            body !== undefined && (
              <p>
                <NoTranslate>{body}</NoTranslate>
              </p>
            )
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
