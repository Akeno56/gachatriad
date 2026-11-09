import type { Metadata } from 'next';
import '@fontsource/vt323/400.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import { GameShell } from '../components/game-shell';
import { LanguageProvider } from '../components/i18n';
import './globals.css';
import './expansion.css';
import './refinements.css';
import './profile-host.css';
import './onboarding.css';
import './boosters.css';
import './community.css';
import './pack-opening.css';
import './rule-examples.css';
import './duplicate-cards.css';
import './duel-refinements.css';
import './community-layout.css';
import './draft-shop.css';
import './queues-training.css';
import './release-twelve.css';
import './localization.css';
import './release-fourteen.css';
import './release-fifteen.css';
import './release-011.css';
import './release-012.css';

export const metadata: Metadata = {
  title: 'Gacha Triad · Cross-world card battle',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/assets/ui/triad-logo.webp` },
  description: 'Collect cards and play Triple Triad against friends, players and bots.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <GameShell>{children}</GameShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
