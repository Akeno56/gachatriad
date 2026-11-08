import { LocaleView } from './i18n';
import type { Card as CardData, Player, CaptureReason } from '@gacha-triad/engine';
import type { CSSProperties } from 'react';
import { Card } from './card';
export function CaptureCard({
  card,
  owner,
  fromOwner,
  captureReason,
  captureOrder = 0,
  stamp,
  showElement = false,
  modifier = 0,
}: {
  card: CardData;
  owner: Player;
  fromOwner?: Player;
  captureReason?: CaptureReason;
  captureOrder?: number;
  stamp: string;
  showElement?: boolean;
  modifier?: number;
}) {
  if (fromOwner === undefined || !captureReason)
    return (
      <LocaleView>
        <Card card={card} owner={owner} showElement={showElement} modifier={modifier} />
      </LocaleView>
    );
  return (
    <LocaleView>
      <div
        key={stamp}
        className="capture-flip-scene"
        data-from-owner={fromOwner}
        data-to-owner={owner}
        style={{ '--capture-delay': `${captureOrder * 160}ms` } as CSSProperties}
      >
        <div className="capture-flip-rotor">
          <div className="capture-flip-old" aria-hidden="true">
            <Card card={card} owner={fromOwner} showElement={showElement} modifier={modifier} />
          </div>
          <div className="capture-flip-new">
            <Card card={card} owner={owner} showElement={showElement} modifier={modifier} />
          </div>
        </div>
        <span className={`capture-badge reason-${captureReason}`}>
          {captureReason === 'standard' ? 'FLIP' : captureReason.toUpperCase()}
        </span>
      </div>
    </LocaleView>
  );
}
