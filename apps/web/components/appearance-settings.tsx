'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { COSMETIC_STYLES, type CosmeticStyle } from '@gacha-triad/shared/customization';
import { assetPath } from '../lib/connection';
import { LocaleView } from './i18n';
import { Button, GameDialog } from './ui';

export const OpenAppearance = createContext<() => void>(() => {});
export const useOpenAppearance = () => useContext(OpenAppearance);

export function useAppearancePreference(key: 'triad-board-theme' | 'triad-card-back') {
  const [value, setValue] = useState<CosmeticStyle>('classic');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      const style = COSMETIC_STYLES.find(({ id }) => id === saved);
      if (style) setValue(style.id);
    } catch {}
  }, [key]);
  return [
    value,
    (next: CosmeticStyle) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {}
    },
  ] as const;
}

export function AppearanceChoices<Style extends string>({
  label,
  name,
  choices,
  value,
  onChange,
  preview,
  disabled,
}: {
  label: string;
  name: string;
  choices: readonly { id: Style; name: string; unlocked?: boolean }[];
  value: Style;
  onChange: (value: Style) => void;
  preview: (value: Style) => ReactNode;
  disabled?: boolean;
}) {
  return (
    <LocaleView>
      <fieldset className="appearance-choices" disabled={disabled}>
        <legend>{label}</legend>
        <div>
          {choices.map(({ id, name: style, unlocked }) => (
            <label
              key={id}
              className={`appearance-option${unlocked === false ? ' is-locked' : ''}`}
            >
              <input
                className="sr-only"
                type="radio"
                name={name}
                value={id}
                checked={id === value}
                disabled={unlocked === false}
                onChange={() => onChange(id)}
              />
              <span className="appearance-tile">
                {preview(id)}
                <span>{style}</span>
                {unlocked === false && <small>Locked</small>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </LocaleView>
  );
}

export function AppearanceSettings({
  open,
  onClose,
  board,
  cardBack,
}: {
  open: boolean;
  onClose: () => void;
  board: ReturnType<typeof useAppearancePreference>;
  cardBack: ReturnType<typeof useAppearancePreference>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <GameDialog
      open={open}
      onClose={onClose}
      labelledBy="appearance-title"
      describedBy="appearance-storage"
      className="appearance-dialog"
      initialFocus={heading}
    >
      <h2 id="appearance-title" ref={heading} tabIndex={-1}>
        Appearance
      </h2>
      <p id="appearance-storage">Saved on this device.</p>
      <AppearanceChoices
        label="Board theme"
        name="board-theme"
        choices={COSMETIC_STYLES}
        value={board[0]}
        onChange={board[1]}
        preview={(id) => (
          <span className="appearance-board-preview" data-board-theme={id} aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} />
            ))}
          </span>
        )}
      />
      <AppearanceChoices
        label="Card back"
        name="card-back"
        choices={COSMETIC_STYLES}
        value={cardBack[0]}
        onChange={cardBack[1]}
        preview={(id) => (
          <span
            className="card-back appearance-card-preview"
            data-card-back={id}
            aria-hidden="true"
          >
            <span className="back-emblem">
              <img src={assetPath('/assets/ui/triad-logo.webp')} alt="" draggable={false} />
            </span>
          </span>
        )}
      />
      <div className="result-actions">
        <Button onClick={onClose}>Done</Button>
      </div>
    </GameDialog>
  );
}
