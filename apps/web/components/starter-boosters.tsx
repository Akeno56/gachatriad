'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from './session';
export function StarterBoosters() {
  const { profile } = useSession(),
    pathname = usePathname();
  if (
    !profile ||
    !!profile.activeMatchId ||
    profile.deck.length === 5 ||
    !profile.unopenedBoosters ||
    pathname.startsWith('/boosters')
  )
    return null;
  return (
    <aside className="menu-window starter-boosters">
      <div>
        <strong>Your starter boosters are ready</strong>
        <p>
          Open your three free boosters to start your collection. Your first deck is built
          automatically.
        </p>
      </div>
      <Link className="primary-button" href="/boosters">
        Open boosters ({profile.unopenedBoosters})
      </Link>
    </aside>
  );
}
