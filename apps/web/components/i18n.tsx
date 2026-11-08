'use client';
import {
  Children,
  createContext,
  useContext,
  useEffect,
  useState,
  isValidElement,
  cloneElement,
  type ReactNode,
  type ReactElement,
} from 'react';
import { translate, type Language } from '../lib/translate';
const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({ language: 'en', setLanguage: () => {} });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrent] = useState<Language>('en');
  useEffect(() => {
    try {
      if (localStorage.getItem('triad-language') === 'fr') setCurrent('fr');
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title =
      language === 'fr'
        ? 'Gacha Triad · Jeu de cartes interunivers'
        : 'Gacha Triad · Cross-world card battle';
  }, [language]);
  function setLanguage(next: Language) {
    setCurrent(next);
    try {
      localStorage.setItem('triad-language', next);
    } catch {}
  }
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function NoTranslate({ children }: { children: ReactNode }) {
  return children;
}
export function LocalizedDate({
  value,
  format = 'date',
  options,
}: {
  value: string | number;
  format?: 'date' | 'time' | 'datetime';
  options?: Intl.DateTimeFormatOptions;
}) {
  const { language } = useContext(LanguageContext);
  const date = new Date(value),
    locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  return format === 'time'
    ? date.toLocaleTimeString(locale, options)
    : format === 'datetime'
      ? date.toLocaleString(locale, options)
      : date.toLocaleDateString(locale, options);
}
/** Translate React text and accessibility labels without mutating DOM, form values or player data. */
export function LocaleView({ children }: { children: ReactNode }) {
  const { language } = useContext(LanguageContext);
  function localize(node: ReactNode): ReactNode {
    if (typeof node === 'string') return translate(node, language);
    if (Array.isArray(node)) return Children.map(node, localize);
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<Record<string, unknown>>;
    if (
      element.type === NoTranslate ||
      element.props.translate === 'no' ||
      ['script', 'style', 'code', 'pre'].includes(element.type as string)
    )
      return element;
    const props: Record<string, unknown> = {};
    for (const attr of ['title', 'aria-label', 'alt', 'placeholder'])
      if (typeof element.props[attr] === 'string')
        props[attr] = translate(element.props[attr] as string, language);
    if ('children' in element.props) props.children = localize(element.props.children as ReactNode);
    return cloneElement(element, props);
  }
  return localize(children);
}
function Flag({ language }: { language: Language }) {
  return language === 'fr' ? (
    <svg viewBox="0 0 30 20" aria-hidden="true">
      <path fill="#fff" d="M0 0h30v20H0z" />
      <path fill="#18388a" d="M0 0h10v20H0z" />
      <path fill="#e4484e" d="M20 0h10v20H20z" />
    </svg>
  ) : (
    <svg viewBox="0 0 30 20" aria-hidden="true">
      <path fill="#203a73" d="M0 0h30v20H0z" />
      <path stroke="#fff" strokeWidth="5" d="m0 0 30 20M30 0 0 20" />
      <path stroke="#d64751" strokeWidth="2" d="m0 0 30 20M30 0 0 20" />
      <path stroke="#fff" strokeWidth="7" d="M15 0v20M0 10h30" />
      <path stroke="#d64751" strokeWidth="4" d="M15 0v20M0 10h30" />
    </svg>
  );
}
export function LanguageSelector() {
  const { language, setLanguage } = useContext(LanguageContext),
    [open, setOpen] = useState(false);
  return (
    <div
      className="language-selector"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        className="language-toggle"
        aria-label={language === 'fr' ? 'Langue : Français' : 'Language: English'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Flag language={language} />
        <span>{language.toUpperCase()}</span>
        <small>▾</small>
      </button>
      {open && (
        <div
          className="language-menu menu-window"
          role="menu"
          aria-label={language === 'fr' ? 'Choisir la langue' : 'Choose language'}
        >
          {(['en', 'fr'] as const).map((lang) => (
            <button
              role="menuitemradio"
              aria-checked={language === lang}
              key={lang}
              onClick={() => {
                setLanguage(lang);
                setOpen(false);
              }}
            >
              <Flag language={lang} />
              {lang === 'fr' ? 'Français' : 'English'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
