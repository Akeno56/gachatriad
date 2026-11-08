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

export const metadata: Metadata = {
  title: 'Gacha Triad · Cross-world card battle',
  description: 'Five cards. Nine spaces. Play a strategic Triple Triad match against the CPU.',
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
