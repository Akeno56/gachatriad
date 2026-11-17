'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ALL_CARDS, UNIVERSES } from '@gacha-triad/shared';
import { buildBestDeck, validateDeck, type Card as CardData } from '@gacha-triad/engine';
import type { DeckLoadout, DeckLoadoutsView, ProfileView } from '@gacha-triad/shared/platform';
import { useSession } from './session';
import { LocaleView, NoTranslate } from './i18n';
import { Button, GameDialog, Tabs, HelpTip } from './ui';
import { Card } from './card';
import { CardDetail } from './card-detail';
import { DeckAnalysis } from './deck-analysis';
import { DeckLeaveWarning } from './deck-editor';
import { browseKey, useBrowseState } from './browse-preferences';
import { api, ApiError } from '../lib/platform';
const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));
const same = (a: readonly string[], b: readonly string[]) => a.join('|') === b.join('|');
const definitions = (ids: readonly string[]) =>
  ids.map((id) => byId.get(id)).filter((c): c is CardData => !!c);
type Draft = {
  id: string | null;
  revision: number;
  name: string;
  cards: string[];
  baseName: string;
  baseCards: string[];
};
const changed = (d: Draft) => d.name !== d.baseName || !same(d.cards, d.baseCards);
const fromSaved = (r: DeckLoadout): Draft => ({
  id: r.id,
  revision: r.revision,
  name: r.name,
  cards: r.cards,
  baseName: r.name,
  baseCards: r.cards,
});
const validIds = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= 5 &&
  v.every((id) => typeof id === 'string' && byId.has(id)) &&
  new Set(v).size === v.length;
function restored(v: unknown): v is Draft {
  if (!v || typeof v !== 'object') return false;
  const d = v as Draft;
  return (
    (d.id === null ||
      (typeof d.id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.id))) &&
    Number.isSafeInteger(d.revision) &&
    d.revision >= 0 &&
    typeof d.name === 'string' &&
    d.name.length <= 40 &&
    typeof d.baseName === 'string' &&
    d.baseName.length <= 40 &&
    validIds(d.cards) &&
    validIds(d.baseCards)
  );
}
export function DeckWorkspace() {
  const { profile, error } = useSession();
  return (
    <LocaleView>
      {profile ? (
        <Builder key={browseKey('deck-workspace', profile.id)} profile={profile} />
      ) : (
        <div className="content-page">
          <h1>Deck workshop</h1>
          <p role="status">{error || 'Connecting to your collection…'}</p>
        </div>
      )}
    </LocaleView>
  );
}
function Builder({ profile }: { profile: ProfileView }) {
  const { refresh } = useSession(),
    key = browseKey('deck-workspace', profile.id);
  const [data, setData] = useState<DeckLoadoutsView | null>(null),
    [loadError, setLoadError] = useState('');
  const generation = useRef(0),
    initialized = useRef(false),
    lock = useRef(false);
  const latestData = useRef(data);
  latestData.current = data;
  const [draft, setDraft] = useState<Draft>({
    id: null,
    revision: 0,
    name: 'Deck 1',
    cards: profile.deck,
    baseName: 'Deck 1',
    baseCards: profile.deck,
  });
  const [error, setError] = useState(''),
    [feedback, setFeedback] = useState(''),
    [operation, setOperation] = useState<'save' | 'use' | 'delete' | null>(null),
    [conflict, setConflict] = useState(false);
  const [replacement, setReplacement] = useState<CardData | null>(null),
    [detail, setDetail] = useState<CardData | null>(null),
    [undo, setUndo] = useState<string[][]>([]);
  const [panel, setPanel] = useState('cards'),
    [pending, setPending] = useState<{ kind: 'new' | 'select'; id?: string } | null>(null),
    [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useBrowseState<string>('builder', 'search', ''),
    [universe, setUniverse] = useBrowseState<string>('builder', 'universe', 'all'),
    [sort, setSort] = useBrowseState<string>('builder', 'sort', 'rarity'),
    [rarity, setRarity] = useBrowseState<string>('builder', 'rarity', 'all'),
    [finish, setFinish] = useBrowseState<string>('builder', 'finish', 'all'),
    [availableOnly, setAvailableOnly] = useBrowseState<boolean>('builder', 'available', false);
  const [page, setPage] = useState(0),
    heading = useRef<HTMLHeadingElement>(null),
    root = useRef<HTMLDivElement>(null),
    filterMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        filterMenu.current?.open &&
        event.target instanceof Node &&
        !filterMenu.current.contains(event.target)
      )
        filterMenu.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => {
    const bar = document.querySelector('.system-bar');
    const measure = () =>
      root.current?.style.setProperty(
        '--deck-system-height',
        `${bar?.getBoundingClientRect().height ?? 62}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    if (bar) observer.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const busy = operation !== null || !data,
    dirty = changed(draft),
    selected = definitions(draft.cards),
    invalid = validateDeck(selected),
    structural = invalid.filter((e) => e !== 'Select exactly five cards.');
  const missing = draft.cards.filter((id) => (profile.inventory[id]?.quantity ?? 0) < 1),
    locked = draft.cards.filter(
      (id) =>
        (profile.inventory[id]?.quantity ?? 0) > 0 && (profile.inventory[id]?.available ?? 0) < 1,
    );
  const currentSaved = data?.loadouts.find((r) => r.id === draft.id),
    stale = !!currentSaved && currentSaved.revision !== draft.revision;
  const isActive =
    !!draft.id && profile.activeLoadoutId === draft.id && same(profile.deck, draft.cards) && !dirty;
  const canSave =
    !!data &&
    !!draft.name.trim() &&
    structural.length === 0 &&
    (!draft.id ? missing.length === 0 : true) &&
    (!draft.id || dirty);
  const canUse =
    !!data &&
    invalid.length === 0 &&
    !missing.length &&
    !locked.length &&
    !!draft.name.trim() &&
    !profile.waitingLobbyId;
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 4500);
    return () => clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    if (dirty) setFeedback('');
  }, [dirty, draft.name, draft.cards]);
  async function load() {
    const id = ++generation.current;
    try {
      const next = await api<DeckLoadoutsView>('/deck-loadouts');
      if (id !== generation.current) return;
      setData(next);
      latestData.current = next;
      setLoadError('');
      if (!initialized.current) {
        initialized.current = true;
        try {
          const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
          if (restored(saved)) setDraft(saved);
          else {
            const active = next.loadouts.find((r) => r.id === next.activeId);
            if (active) setDraft(fromSaved(active));
          }
        } catch {}
      }
    } catch (e) {
      if (id === generation.current) setLoadError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const visible = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(visible, 30000);
    document.addEventListener('visibilitychange', visible);
    return () => {
      generation.current++;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [key]);
  useEffect(() => {
    if (!initialized.current) return;
    try {
      if (dirty) sessionStorage.setItem(key, JSON.stringify(draft));
      else sessionStorage.removeItem(key);
    } catch {}
  }, [key, draft, dirty, data]);
  useEffect(() => setPage(0), [search, universe, rarity, sort, finish, availableOnly]);
  function nextName(base = 'Deck') {
    let i = 1;
    while (
      latestData.current?.loadouts.some(
        (r) => r.name.toLowerCase() === `${base.slice(0, 32)} ${i}`.toLowerCase(),
      )
    )
      i++;
    return `${base.slice(0, 32)} ${i}`;
  }
  function openTarget(target: { kind: 'new' | 'select'; id?: string }) {
    const row = latestData.current?.loadouts.find((r) => r.id === target.id),
      name = nextName();
    setDraft(
      target.kind === 'select' && row
        ? fromSaved(row)
        : { id: null, revision: 0, name, cards: [], baseName: name, baseCards: [] },
    );
    setReplacement(null);
    setUndo([]);
    setError('');
    setConflict(false);
    setPending(null);
    setFeedback('');
  }
  function chooseTarget(target: { kind: 'new' | 'select'; id?: string }) {
    if (busy) return;
    if (dirty) setPending(target);
    else openTarget(target);
  }
  function edit(cards: string[]) {
    if (busy) return;
    setUndo((h) => [...h, draft.cards].slice(-20));
    setDraft((d) => ({ ...d, cards }));
    setReplacement(null);
    setError('');
  }
  function add(card: CardData) {
    const existing = selected.findIndex(
      (c) => (c.baseCardId ?? c.id) === (card.baseCardId ?? card.id),
    );
    if (existing >= 0) {
      if (selected[existing].id !== card.id)
        edit(draft.cards.map((id, i) => (i === existing ? card.id : id)));
      return;
    }
    if (draft.cards.length < 5) edit([...draft.cards, card.id]);
    else {
      setReplacement(card);
      setPanel('cards');
    }
  }
  function discard() {
    if (currentSaved) setDraft(fromSaved(currentSaved));
    else setDraft((d) => ({ ...d, name: d.baseName, cards: d.baseCards }));
    setUndo([]);
    setReplacement(null);
    setError('');
    setConflict(false);
  }
  async function persist(use = false): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setOperation(use ? 'use' : 'save');
    setError('');
    setConflict(false);
    try {
      let row: DeckLoadout;
      if (!draft.id || dirty) {
        row = await api<DeckLoadout>(draft.id ? `/deck-loadouts/${draft.id}` : '/deck-loadouts', {
          name: draft.name,
          revision: draft.revision,
          ...(!draft.id || !same(draft.cards, draft.baseCards) ? { cards: draft.cards } : {}),
        });
        setDraft(fromSaved(row));
        setUndo([]);
      } else
        row = {
          id: draft.id,
          name: draft.name,
          cards: draft.cards,
          revision: draft.revision,
          updatedAt: '',
        };
      if (use) await api(`/deck-loadouts/${row.id}/activate`, { revision: row.revision });
      await Promise.all([load(), refresh()]);
      setFeedback(use ? 'Active deck updated.' : 'Loadout saved.');
      return true;
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        await load();
      }
      return false;
    } finally {
      lock.current = false;
      setOperation(null);
    }
  }
  async function remove() {
    if (!draft.id || lock.current) return;
    lock.current = true;
    setOperation('delete');
    setError('');
    try {
      await api(`/deck-loadouts/${draft.id}`, { revision: draft.revision }, 'DELETE');
      setDeleting(false);
      const name = nextName();
      setDraft({
        id: null,
        revision: 0,
        name,
        cards: profile.deck,
        baseName: name,
        baseCards: profile.deck,
      });
      setUndo([]);
      await Promise.all([load(), refresh()]);
      setFeedback('Loadout deleted.');
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        await load();
      }
    } finally {
      lock.current = false;
      setOperation(null);
    }
  }
  const owned = ALL_CARDS.filter(
    (c) =>
      c.enabled &&
      (profile.inventory[c.id]?.quantity ?? 0) > 0 &&
      c.name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (universe === 'all' || c.universeId === universe) &&
      (rarity === 'all' || c.rarity === Number(rarity)) &&
      (finish === 'all' || (finish === 'holo' ? c.finish === 'holo' : !c.finish)) &&
      (!availableOnly || (profile.inventory[c.id]?.available ?? 0) > 0),
  ).sort((a, b) => {
    const side = ['top', 'right', 'bottom', 'left'].indexOf(sort);
    return (
      (side >= 0
        ? b.stats[side] - a.stats[side]
        : sort === 'stats'
          ? b.stats.reduce((n, v) => n + v, 0) - a.stats.reduce((n, v) => n + v, 0)
          : sort === 'name'
            ? a.name.localeCompare(b.name)
            : b.rarity - a.rarity) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
    );
  });
  const pages = Math.max(1, Math.ceil(owned.length / 24)),
    currentPage = Math.min(page, pages - 1);
  return (
    <LocaleView>
      <div ref={root} className="content-page deck-workspace">
        <header className="builder-page-heading">
          <div>
            <h1>Deck workshop</h1>
            <div className="builder-hand-status">
              <strong>{`${draft.cards.length}/5 cards`}</strong>
              <span>
                {isActive
                  ? 'Active deck'
                  : dirty
                    ? 'Unsaved changes'
                    : draft.id
                      ? 'Saved loadout'
                      : 'New loadout'}
              </span>
            </div>
          </div>
          <div>
            <Link href="/collection">Collection</Link>
            <Link className="outline-button" href="/">
              Back to play
            </Link>
          </div>
        </header>
        <div className="builder-loadout-bar menu-window">
          <label>
            Saved loadout
            <select
              aria-label="Saved loadout"
              name="loadout"
              value={draft.id ?? ''}
              disabled={busy || !data}
              onChange={(e) =>
                chooseTarget({ kind: e.target.value ? 'select' : 'new', id: e.target.value })
              }
            >
              <option value="">Unsaved loadout</option>
              {draft.id && !currentSaved && <option value={draft.id}>Loadout unavailable</option>}
              {data?.loadouts.map((r) => (
                <option key={r.id} value={r.id}>
                  <NoTranslate>{r.name}</NoTranslate>
                  {profile.activeLoadoutId === r.id ? ' · Active' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="builder-loadout-tools">
            <Button
              disabled={busy || !data || data.loadouts.length >= data.limit}
              onClick={() => chooseTarget({ kind: 'new' })}
            >
              New loadout
            </Button>
            <Button
              disabled={busy || !data || data.loadouts.length >= data.limit}
              onClick={() => {
                if (dirty) {
                  setError('Save or discard your edits before making a copy.');
                  return;
                }
                const name = nextName(draft.name || 'Deck');
                setDraft({
                  id: null,
                  revision: 0,
                  name,
                  cards: draft.cards,
                  baseName: '',
                  baseCards: [],
                });
                setUndo([]);
                setReplacement(null);
                setError('');
              }}
            >
              Make a copy
            </Button>
            <Button variant="ghost" disabled={busy || !draft.id} onClick={() => setDeleting(true)}>
              Delete loadout
            </Button>
          </div>
          <small role="status">
            {feedback || `${data?.loadouts.length ?? 0} / ${data?.limit ?? 12} loadouts`}
          </small>
          <HelpTip label="About saved loadouts">
            Saving a loadout keeps your active deck unchanged.
          </HelpTip>
        </div>
        {loadError && (
          <div className="builder-alert" role="alert">
            {loadError}
            <Button variant="ghost" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}
        {error && (
          <div className="builder-alert" role="alert">
            {error}
            {(conflict || stale) && currentSaved && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(fromSaved(currentSaved));
                  setConflict(false);
                  setError('');
                  setUndo([]);
                }}
              >
                Load latest saved version
              </Button>
            )}
          </div>
        )}
        {stale && !error && (
          <div className="builder-alert" role="status">
            This loadout changed elsewhere. Your edits are preserved.{' '}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (currentSaved) setDraft(fromSaved(currentSaved));
                setUndo([]);
              }}
            >
              Load latest saved version
            </Button>
          </div>
        )}
        <div className="builder-workbench">
          <section className="builder-hand-panel menu-window" aria-label="Loadout editor">
            <div className="builder-hand-controls">
              <label>
                Loadout name
                <input
                  name="loadout-name"
                  maxLength={40}
                  value={draft.name}
                  disabled={busy}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              <div className="builder-primary-actions">
                <Button
                  disabled={busy || !canSave}
                  busy={operation === 'save'}
                  onClick={() => void persist()}
                >
                  Save loadout
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || !canUse || isActive}
                  busy={operation === 'use'}
                  onClick={() => void persist(true)}
                >
                  {dirty || !draft.id ? 'Save & use' : 'Use this deck'}
                </Button>
              </div>
            </div>
            <div className="builder-hand-display">
              <div className={`builder-hand-slots ${replacement ? 'choosing-replacement' : ''}`}>
                {Array.from({ length: 5 }, (_, index) => {
                  const card = byId.get(draft.cards[index]);
                  return (
                    <div className="builder-hand-slot" key={index}>
                      {card ? (
                        <>
                          <button
                            className={`builder-slot-card ${(profile.inventory[card.id]?.quantity ?? 0) < 1 ? 'missing-card' : ''}`}
                            disabled={busy}
                            aria-label={
                              replacement
                                ? `Replace ${card.name} with ${replacement.name}`
                                : `Inspect ${card.name}`
                            }
                            onClick={() =>
                              replacement
                                ? edit(
                                    draft.cards.map((id, i) => (i === index ? replacement.id : id)),
                                  )
                                : setDetail(card)
                            }
                          >
                            <Card key={card.id} card={card} />
                          </button>
                          <button
                            className="builder-remove-card"
                            type="button"
                            disabled={busy || !!replacement}
                            aria-label={`Remove ${card.name}`}
                            onClick={() => edit(draft.cards.filter((_, i) => i !== index))}
                          >
                            ×
                          </button>
                          {(profile.inventory[card.id]?.quantity ?? 0) < 1 ? (
                            <span className="builder-card-availability">Not owned</span>
                          ) : (profile.inventory[card.id]?.available ?? 0) < 1 ? (
                            <span className="builder-card-availability">Locked</span>
                          ) : null}
                        </>
                      ) : (
                        <div className="builder-empty-slot">
                          <span>+</span>
                          <small>{`Slot ${index + 1}`}</small>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="builder-validation" role="status">
                {replacement ? (
                  <>
                    <span>Choose a slot to replace with</span>{' '}
                    <NoTranslate>{replacement.name}</NoTranslate>.{' '}
                    <Button variant="ghost" onClick={() => setReplacement(null)}>
                      Cancel replacement
                    </Button>
                  </>
                ) : invalid.length ? (
                  invalid.join(' ')
                ) : missing.length ? (
                  'Replace missing cards before using this deck.'
                ) : locked.length ? (
                  'Some cards are locked. You can save this loadout and use it when they are available.'
                ) : profile.waitingLobbyId ? (
                  'Leave matchmaking before switching your active deck.'
                ) : (
                  'Ready for battle.'
                )}
              </div>
            </div>
          </section>
          <div className="builder-browser">
            <div className="builder-browser-toolbar">
              <Tabs
                className="builder-mobile-tabs"
                label="Deck workspace panels"
                value={panel}
                onChange={setPanel}
                items={[
                  { value: 'cards', label: 'Your cards' },
                  { value: 'analysis', label: 'Deck outlook' },
                ]}
              />
              <div className="builder-secondary-actions">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    try {
                      edit(
                        buildBestDeck(
                          ALL_CARDS.filter((c) => (profile.inventory[c.id]?.available ?? 0) > 0),
                        ).map((c) => c.id),
                      );
                    } catch {
                      setError('Your available collection cannot form a legal five-card deck.');
                    }
                  }}
                >
                  Auto build
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || !undo.length}
                  onClick={() => {
                    const previous = undo.at(-1)!;
                    setUndo((h) => h.slice(0, -1));
                    setDraft((d) => ({ ...d, cards: previous }));
                    setReplacement(null);
                    setError('');
                  }}
                >
                  Undo
                </Button>
                {dirty && (
                  <Button variant="ghost" disabled={busy} onClick={discard}>
                    Discard changes
                  </Button>
                )}
              </div>
            </div>
            <div className={`builder-lower-grid panel-${panel}`}>
              <section
                className="builder-library menu-window"
                aria-labelledby="builder-library-title"
              >
                <div className="builder-section-heading">
                  <h2 id="builder-library-title">Your cards</h2>
                  <span>{owned.length === 1 ? '1 card' : `${owned.length} cards`}</span>
                </div>
                <div className="builder-filters">
                  <label>
                    Find a card
                    <input
                      name="builder-search"
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search your collection…"
                    />
                  </label>
                  <label>
                    Universe
                    <select
                      name="builder-universe"
                      value={universe}
                      onChange={(e) => setUniverse(e.target.value)}
                    >
                      <option value="all">All universes</option>
                      {UNIVERSES.map((u) => (
                        <option key={u.id} value={u.id}>
                          <NoTranslate>{u.name}</NoTranslate>
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rarity
                    <select
                      name="builder-rarity"
                      value={rarity}
                      onChange={(e) => setRarity(e.target.value)}
                    >
                      <option value="all">All rarities</option>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <option key={v} value={v}>{`${v}★`}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sort by
                    <select
                      name="builder-sort"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="rarity">Rarity · highest first</option>
                      <option value="stats">Total stats · highest first</option>
                      <option value="name">Name · A–Z</option>
                      <option value="top">Top · highest first</option>
                      <option value="right">Right · highest first</option>
                      <option value="bottom">Bottom · highest first</option>
                      <option value="left">Left · highest first</option>
                    </select>
                  </label>
                  <details
                    className="builder-filter-more"
                    ref={filterMenu}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.currentTarget.open = false;
                        event.currentTarget.querySelector('summary')?.focus();
                      }
                    }}
                  >
                    <summary>
                      More filters
                      {(finish !== 'all' || availableOnly) && <b aria-hidden="true"> ·</b>}
                    </summary>
                    <div className="builder-filter-popover">
                      <label>
                        Card finish
                        <select
                          name="builder-finish"
                          value={finish}
                          onChange={(e) => setFinish(e.target.value)}
                        >
                          <option value="all">All finishes</option>
                          <option value="standard">Standard</option>
                          <option value="holo">Holo</option>
                        </select>
                      </label>
                      <label className="builder-available-filter">
                        <input
                          name="builder-available"
                          type="checkbox"
                          checked={availableOnly}
                          onChange={(e) => setAvailableOnly(e.target.checked)}
                        />
                        Available only
                      </label>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setFinish('all');
                          setAvailableOnly(false);
                        }}
                      >
                        Reset extra filters
                      </Button>
                    </div>
                  </details>
                </div>
                <div className="builder-card-library">
                  {owned.slice(currentPage * 24, (currentPage + 1) * 24).map((card) => {
                    const inDeck = draft.cards.includes(card.id),
                      sameCharacter = selected.some(
                        (c) => (c.baseCardId ?? c.id) === (card.baseCardId ?? card.id),
                      );
                    return (
                      <article key={card.id} className={inDeck ? 'in-deck' : ''}>
                        <button
                          className="builder-library-card"
                          aria-label={`Inspect ${card.name}`}
                          onClick={() => setDetail(card)}
                        >
                          <Card card={card} />
                        </button>
                        <div className="builder-library-card-note">
                          <span>{`${profile.inventory[card.id]?.quantity ?? 0} owned`}</span>
                          {!(profile.inventory[card.id]?.available ?? 0) && <span>Locked</span>}
                        </div>
                        <Button disabled={busy || inDeck} onClick={() => add(card)}>
                          {inDeck
                            ? 'In deck'
                            : sameCharacter
                              ? 'Switch finish'
                              : draft.cards.length === 5
                                ? 'Replace a card'
                                : 'Add to deck'}
                        </Button>
                      </article>
                    );
                  })}
                  {!owned.length && (
                    <div className="builder-empty-results">
                      <p>No cards match these filters.</p>
                      <Button
                        onClick={() => {
                          setSearch('');
                          setUniverse('all');
                          setRarity('all');
                          setFinish('all');
                          setAvailableOnly(false);
                        }}
                      >
                        Reset filters
                      </Button>
                      <Link className="outline-button" href="/boosters">
                        Open boosters
                      </Link>
                    </div>
                  )}
                </div>
                <div className="builder-pagination">
                  <Button
                    variant="ghost"
                    disabled={currentPage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <span>{`Page ${currentPage + 1}/${pages}`}</span>
                  <Button
                    variant="ghost"
                    disabled={currentPage >= pages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </section>
              <aside className="builder-outlook menu-window">
                <DeckAnalysis
                  cards={selected}
                  comparison={dirty ? definitions(draft.baseCards) : undefined}
                />
              </aside>
            </div>
          </div>
        </div>
        <CardDetail card={detail} onClose={() => setDetail(null)} />
        <DeckLeaveWarning
          dirty={dirty}
          canSave={canSave}
          busy={busy}
          save={() => persist()}
          discard={discard}
          error={error}
        />
        <GameDialog
          open={!!pending}
          onClose={() => setPending(null)}
          labelledBy="loadout-switch-title"
          dismissible={!busy}
          initialFocus={heading}
          className="builder-confirm-dialog"
        >
          <h2 id="loadout-switch-title" ref={heading} tabIndex={-1}>
            Unsaved loadout changes
          </h2>
          <p>Save your loadout before switching, or discard your edits.</p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="result-actions">
            <Button
              variant="primary"
              disabled={!canSave || busy}
              onClick={async () => {
                const target = pending;
                if (target && (await persist())) openTarget(target);
              }}
            >
              Save and switch
            </Button>
            <Button disabled={busy} onClick={() => pending && openTarget(pending)}>
              Discard and switch
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
              Keep editing
            </Button>
          </div>
        </GameDialog>
        <GameDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          labelledBy="loadout-delete-title"
          dismissible={!busy}
          className="builder-confirm-dialog"
        >
          <h2 id="loadout-delete-title">Delete this loadout?</h2>
          <p>
            <NoTranslate>{draft.name}</NoTranslate>
          </p>
          <p>
            Your cards and active deck will stay intact. Only this saved loadout will be deleted.
          </p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="result-actions">
            <Button
              variant="primary"
              busy={operation === 'delete'}
              disabled={busy}
              onClick={() => void remove()}
            >
              Delete loadout
            </Button>
            <Button disabled={busy} onClick={() => setDeleting(false)}>
              Keep loadout
            </Button>
          </div>
        </GameDialog>
      </div>
    </LocaleView>
  );
}
