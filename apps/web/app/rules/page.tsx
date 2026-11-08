'use client';
import { LocaleView } from '../../components/i18n';
import Link from 'next/link';
import { RulesContent } from '../../components/rules-content';
import { RulebookAcknowledgement } from '../../components/tutorial';
export default function RulesPage() {
  return (
    <LocaleView>
      <div className="content-page">
        <div className="eyebrow">THE RULEBOOK</div>
        <h1>Battle manual</h1>
        <p className="page-description">Basic captures, special rules, and chain reactions.</p>
        <RulesContent />
        <RulebookAcknowledgement />
        <div className="page-cta">
          <Link href="/" className="primary-button">
            Put it into practice <span>→</span>
          </Link>
          <a
            href="https://na.finalfantasyxiv.com/lodestone/playguide/contentsguide/goldsaucer/tripletriad/"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            FFXIV official rules reference ↗
          </a>
        </div>
      </div>
    </LocaleView>
  );
}
