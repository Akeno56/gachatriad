'use client';
import Link from 'next/link';
import { CURRENT_SEASON } from '@gacha-triad/shared/journey';
import { LocaleView } from './i18n';
export function SeasonBanner() {
  return (
    <LocaleView>
      <section className="menu-window season-banner" aria-label="Current season">
        <span className="season-seal" aria-hidden="true">
          <svg viewBox="0 0 52 52" focusable="false">
            <polygon
              points="26,4 48,26 26,48 4,26"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
            />
            <text x="26" y="26" textAnchor="middle" dominantBaseline="central">
              {CURRENT_SEASON.id}
            </text>
          </svg>
        </span>
        <div className="season-copy">
          <div className="eyebrow">Season {CURRENT_SEASON.id} · Alpha</div>
          <h2>{CURRENT_SEASON.name}</h2>
        </div>
        <Link className="outline-button" href="/journey#season">
          Your season record <span aria-hidden="true">→</span>
        </Link>
      </section>
    </LocaleView>
  );
}
