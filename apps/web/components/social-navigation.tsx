'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LocaleView } from './i18n';
import { useSocial } from './social-state';
import { useSession } from './session';

export function SocialNavigation() {
  const { data } = useSocial();
  const { profile } = useSession();
  const pathname = usePathname();
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
    </LocaleView>
  );
}
