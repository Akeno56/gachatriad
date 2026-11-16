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
  it('distinguishes the two Draft queues in French', () => {
    expect(translate('Draft', 'fr')).toBe('Draft');
    expect(translate('Shared Draft', 'fr')).toBe('Draft partagé');
    expect(translate('Join Shared Draft queue', 'fr')).toBe('Rejoindre la file Draft partagé');
    expect(translate('Leave Shared Draft (Ranked) queue', 'fr')).toContain('Draft partagé');
    expect(translate('Pick Robin', 'fr')).toBe('Choisir Robin');
  });
  it('localizes audit findings without translating player names or rules', () => {
    expect(translate("Plus's table", 'fr')).toBe('Table de Plus');
    expect(translate('Aha wins', 'fr')).toBe('Aha gagne');
    expect(translate('12 matching offers', 'fr')).toBe('12 offres correspondantes');
    expect(translate('Not enough Stellar Prisms.', 'fr')).toBe('Pas assez de Prismes stellaires.');
    expect(translate('· Holo +1 Right', 'fr')).toBe('· Holo +1 Droite');
    expect(translate('Battle chat channels', 'fr')).toBe('Canaux de discussion en partie');
    expect(translate('1 owned', 'fr')).toBe('1 possédée');
    expect(translate('1 owned · 3 available', 'fr')).toBe('Possédées : 1 · Disponibles : 3');
  });
});
