import type { ReactNode } from 'react';
import type { Rules } from '@gacha-triad/engine';

type RuleProps = {
  rules: Rules;
  onChange: (rules: Rules) => void;
  disabled?: boolean;
};

export function RuleVisibility({ rules, onChange, disabled }: RuleProps) {
  return (
    <label>
      Visibility
      <select
        name="visibility"
        value={rules.allOpen ? 'allOpen' : rules.threeOpen ? 'threeOpen' : 'closed'}
        disabled={disabled}
        onChange={({ target: { value } }) =>
          onChange({ ...rules, allOpen: value === 'allOpen', threeOpen: value === 'threeOpen' })
        }
      >
        <option value="threeOpen">Three Open</option>
        <option value="allOpen">All Open</option>
        <option value="closed">Closed</option>
      </select>
    </label>
  );
}

const toggles = [
  { key: 'same', label: 'Same' },
  { key: 'plus', label: 'Plus' },
  { key: 'combo', label: 'Combo' },
  { key: 'random', label: 'Random deck' },
  { key: 'elemental', label: 'Elemental' },
] as const;

export function RuleToggles({
  rules,
  onChange,
  disabled,
  children,
}: RuleProps & { children?: ReactNode }) {
  return (
    <div className="rule-toggles">
      {toggles.map(({ key, label }) => (
        <label key={key}>
          <input
            name={key}
            type="checkbox"
            checked={!!rules[key]}
            disabled={disabled || (key === 'combo' && !rules.same && !rules.plus)}
            onChange={(event) => {
              const next = { ...rules, [key]: event.target.checked };
              onChange(next.same || next.plus ? next : { ...next, combo: false });
            }}
          />
          {label}
        </label>
      ))}
      {children}
    </div>
  );
}
