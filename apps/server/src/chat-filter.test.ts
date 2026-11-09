import { expect, it } from 'vitest';
import { chatViolation } from './chat-filter';
it('blocks clear English and French abuse, including common obfuscation', () => {
  for (const text of [
    'fuck!',
    'F U C K',
    'f.u.c.k',
    'fück',
    'f\u200buck',
    'connard',
    'enculé',
    'fils de pute',
    'kys',
    'je vais te tuer',
    'send me your password',
    'https://bad.invalid/steal.exe',
  ])
    expect(chatViolation(text), text).not.toBeNull();
});
it('does not substring-match ordinary names, gameplay or friendly EN/FR conversation', () => {
  for (const text of [
    'Hello! Good game.',
    'Salut, bien joué !',
    'A classic match in Scunthorpe',
    'Scunthorpe and computing classes',
    'Aha is fun with Plus and Same.',
    'Je cherche une carte 4 étoiles.',
    'Merci, à bientôt !',
    'Désolé, je suis en retard.',
    'https://gachatriad.com',
  ])
    expect(chatViolation(text), text).toBeNull();
});
