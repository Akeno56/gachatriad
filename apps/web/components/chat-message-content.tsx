import { LocaleView, NoTranslate, LocalizedDate } from './i18n';
import { BATTLE_STAMPS, type BattleIdentity, type BattleStampId } from '@gacha-triad/shared/social';
import { Avatar } from './avatar';
import { ChatPlayerName } from './mini-profile';
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
              <ChatPlayerName id={person.id}>
                <NoTranslate>{person.name}</NoTranslate>
              </ChatPlayerName>
            ) : (
              <strong>
                <NoTranslate>{person.name}</NoTranslate>
              </strong>
            )}
            {person.title && <small className="message-title">{person.title}</small>}
          </header>
          {stamp ? (
            <p data-stamp={stamp.id}>{stamp.label}</p>
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
