'use client';
import { LocaleView } from '../../components/i18n';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function LegacyDecks() {
  const router = useRouter();
  useEffect(() => router.replace('/collection'), [router]);
  return (
    <LocaleView>
      <div className="content-page">
        <h1>Collection</h1>
        <Link href="/collection">Open your collection</Link>
      </div>
    </LocaleView>
  );
}
