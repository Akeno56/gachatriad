'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LocaleView, NoTranslate } from './i18n';
import { useSocial } from './social-state';
import { useSession } from './session';

const noticeDuration = 10_000;

export function SocialNavigation() {
  const { data } = useSocial();
  const { profile } = useSession();
  const pathname = usePathname();
  const profileId = profile?.id;
  const announced = useRef(new Set<string>());
  const [noticeId, setNoticeId] = useState<string>();
  useEffect(() => {
    announced.current.clear();
    setNoticeId(undefined);
  }, [profileId]);
  useEffect(() => {
    if (!profileId) return;
    const incoming = data.invitations.filter(
      ({ id, recipient, turnHours }) =>
        recipient.id === profileId && !turnHours && !announced.current.has(id),
    );
    if (!incoming.length) return;
    for (const { id } of incoming) announced.current.add(id);
    setNoticeId(incoming[0].id);
  }, [data.invitations, profileId]);
  useEffect(() => {
    if (!noticeId) return;
    const timer = setTimeout(() => setNoticeId(undefined), noticeDuration);
    return () => clearTimeout(timer);
  }, [noticeId]);
  const notice = data.invitations.find(
    ({ id, recipient }) => id === noticeId && recipient.id === profileId,
  );
  const unread =
    data.friends.filter(({ status }) => status === 'incoming').length +
    data.invitations.filter(({ recipient }) => recipient.id === profile?.id).length +
    data.conversations.reduce((sum, conversation) => sum + conversation.unread, 0);
  const label =
    unread > 1
      ? `Social · ${unread} notifications`
      : unread === 1
        ? 'Social · 1 notification'
        : 'Social';
  return (
    <LocaleView>
      <Link
        className="social-navigation"
        href={unread ? '/social?tab=inbox' : '/social'}
        aria-current={pathname.replace(/\/+$/, '') === '/social' ? 'page' : undefined}
        aria-label={label}
        title={label}
      >
        <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M1.5 16v-1.5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3V16m2-4.5h2a3 3 0 0 1 3 3V16M6.5 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm7 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <span>Social</span>
        {unread > 0 && (
          <b className="social-indicator" aria-hidden="true">
            !
          </b>
        )}
      </Link>
      <div className="live-invite-notice" role="status" aria-live="polite" aria-atomic="true">
        {notice && (
          <div
            className="live-invite-popup"
            key={notice.id}
            style={{ animationDuration: `${noticeDuration}ms` }}
          >
            <Link href="/social?tab=inbox" onClick={() => setNoticeId(undefined)}>
              <strong>Live duel invitation</strong>
              <span>
                <NoTranslate>{notice.sender.name}</NoTranslate>
              </span>
            </Link>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNoticeId(undefined)}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </LocaleView>
  );
}
