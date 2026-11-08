import { describe, it, expect } from 'vitest';
import { translate } from './translate';
import { TRAINING_STEPS } from '../../../packages/shared/src/training-duel';
import { PRESETS } from '../../../packages/engine/src/index';
describe('French game text', () => {
  it('translates every training explanation and practice rule description', () => {
    for (const step of TRAINING_STEPS)
      expect(translate(step.text, 'fr'), step.title).not.toBe(step.text);
    for (const preset of PRESETS)
      expect(translate(preset.description, 'fr'), preset.name).not.toBe(preset.description);
  });
  it('keeps rules and character names intact while interpolating dynamic messages', () => {
    for (const name of [
      'Same',
      'Plus',
      'Combo',
      'Elemental',
      'All Open',
      'Three Open',
      'Closed',
      'Random',
      'Trade One',
      'Robin',
      'Aha',
    ])
      expect(translate(name, 'fr')).toBe(name);
    expect(translate('Inspect Silver Wolf · Lv. 999', 'fr')).toBe('Examiner Silver Wolf · Lv. 999');
    expect(translate('Play sent you a duel invitation', 'fr')).toBe('Play vous a invité en duel');
    expect(translate('You need 300 Stellar Prisms for this card.', 'fr')).toContain(
      '300 Prismes stellaires',
    );
    expect(translate('Buy Gacha Universe II Boosters', 'fr')).toContain('Gacha Universe II');
  });
  it('preserves spaces, English and unsupported user-authored text', () => {
    expect(translate(' Play ', 'fr')).toBe(' Jouer ');
    expect(translate('Play', 'en')).toBe('Play');
    expect(translate('Hello, this is my own chat message', 'fr')).toBe(
      'Hello, this is my own chat message',
    );
  });
});
