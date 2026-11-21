import type { ReactNode } from 'react';
import { UNRANKED_RANDOM_RULES, UNRANKED_RULES, type Rules } from '@gacha-triad/engine';
import { LocaleView } from './i18n';
import { ruleNames } from '../lib/rules';

type RuleProps = {
  rules: Rules;
  onChange: (rules: Rules) => void;
  disabled?: boolean;
};
export const MATCH_RULE_PRESETS = {
  standard: { label: 'Standard rules', rules: UNRANKED_RULES },
  random: { label: 'Random deck rules', rules: UNRANKED_RANDOM_RULES },
} as const;
export type MatchRulesPreset = keyof typeof MATCH_RULE_PRESETS | 'custom';

export function MatchRules({
  preset,
  onPreset,
  rules,
  onChange,
  disabled,
}: RuleProps & { preset: MatchRulesPreset; onPreset: (preset: MatchRulesPreset) => void }) {
  return (
    <LocaleView>
      <div className="match-rules">
        <label>
          Rules
          <select
            name="rules-preset"
            value={preset}
            disabled={disabled}
            onChange={(event) => {
              const choice = event.target.value as MatchRulesPreset;
              onPreset(choice);
              if (choice !== 'custom') onChange(MATCH_RULE_PRESETS[choice].rules);
            }}
          >
            {Object.entries(MATCH_RULE_PRESETS).map(([id, choice]) => (
              <option key={id} value={id}>
                {choice.label}
              </option>
            ))}
            <option value="custom">Custom rules</option>
          </select>
        </label>
        {preset === 'custom' ? (
          <>
            <RuleVisibility rules={rules} onChange={onChange} disabled={disabled} />
            <RuleToggles rules={rules} onChange={onChange} disabled={disabled} />
          </>
        ) : (
          <div className="rule-badges">
            {ruleNames(rules).map((rule) => (
              <span key={rule}>{rule}</span>
            ))}
          </div>
        )}
      </div>
    </LocaleView>
  );
}

export function RuleVisibility({ rules, onChange, disabled }: RuleProps) {
  return (
    <LocaleView>
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
    </LocaleView>
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
    <LocaleView>
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
    </LocaleView>
  );
}
