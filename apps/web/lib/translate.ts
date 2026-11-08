import dictionary from './translations-fr.json';
export type Language = 'en' | 'fr';
const messages: Record<string, string> = dictionary;
const localizedSlots: Record<string, number[]> = {
  'Buy {0}': [],
  'Buy {0}s': [0],
  'Open {0} ({1} of {2} available)': [0],
  'Leave {0} queue': [0],
  '{0} matchmaking queue': [0],
  '{0} chat messages': [0],
  '{0} element': [0],
};
const patterns = Object.entries(messages)
  .filter(([key]) => /\{\d+\}/.test(key))
  .sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
  .map(([key, value]) => ({
    key,
    pattern: new RegExp(
      '^' +
        key
          .split(/(\{\d+\})/)
          .map((part) =>
            /^\{\d+\}$/.test(part) ? '(.+?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          )
          .join('') +
        '$',
    ),
    value,
  }));
export function translate(text: string, language: Language): string {
  if (language === 'en' || !/[a-zA-Z]/.test(text)) return text;
  const key = text.replace(/\s+/g, ' ').trim();
  let result = messages[key];
  if (!result) {
    for (const { pattern, value, key: patternKey } of patterns) {
      const match = key.match(pattern);
      if (match) {
        result = value.replace(/\{(\d+)\}/g, (_, n) => {
          const slot = match[Number(n) + 1] ?? '';
          return localizedSlots[patternKey]?.includes(Number(n)) ? translate(slot, language) : slot;
        });
        if (patternKey === 'Buy {0}' && /^Gacha Universe (I|II) Booster/.test(match[1]))
          result = value.replace('{0}', translate(match[1], language));
        if (patternKey.startsWith('Inspect '))
          result = result
            .replace(/, not owned$/, ', non possédée')
            .replace(/, highlighted$/, ', en surbrillance');
        break;
      }
    }
  }
  if (!result) return text;
  return (text.match(/^\s*/)?.[0] ?? '') + result + (text.match(/\s*$/)?.[0] ?? '');
}
