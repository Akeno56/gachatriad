'use client';
import type { CpuStyle } from '@gacha-triad/engine';
import { BOT_STYLES } from '@gacha-triad/shared/bots';
import { LocaleView } from './i18n';
export function BotStyle({ style }: { style?: CpuStyle | null }) {
  const item = BOT_STYLES.find((item) => item.id === style);
  if (!item) return null;
  return (
    <LocaleView>
      <span className="bot-style" title={item.description}>
        {item.name}
      </span>
    </LocaleView>
  );
}
