'use client';
import { LocaleView } from '../components/i18n';
import { Game } from '../components/game';
export default function Home() {
  return (
    <LocaleView>
      <Game />
    </LocaleView>
  );
}
