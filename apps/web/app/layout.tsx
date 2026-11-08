import type { Metadata } from 'next';
import '@fontsource/vt323/400.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import { GameShell } from '../components/game-shell';
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

export const metadata: Metadata = {
  title: 'Gacha Triad · Cross-world card battle',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/assets/ui/triad-logo.webp` },
  description: 'Collect cards and play Triple Triad against friends, players and bots.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <GameShell>{children}</GameShell>
      </body>
    </html>
  );
}
