'use client';
import { useEffect, useRef, useState } from 'react';
import { ALL_CARDS } from '@gacha-triad/shared';
import { ECONOMY, type DuplicateInput, type DuplicateResult } from '@gacha-triad/shared/platform';
import { useSession } from './session';
import { useGameAudio } from './game-shell';
import { LocaleView, NoTranslate } from './i18n';
import { Avatar } from './avatar';
import { Card } from './card';
import { api, ApiError } from '../lib/platform';
type Quote = { kind: 'recycle' | 'trade-up'; cards: DuplicateInput[]; id?: string };
const definitions = new Map(ALL_CARDS.map((c) => [c.id, c]));
export function DuplicateCards() {
  const { profile, refresh } = useSession(),
    play = useGameAudio();
  const [holo, setHolo] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [result, setResult] = useState<DuplicateResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const key = `triad-duplicates:${profile?.id}`;
  useEffect(() => {
    setQuote(null);
    setResult(null);
    setError('');
    if (!profile) return;
    try {
      const previous = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (
        previous &&
        typeof previous.id === 'string' &&
        ['recycle', 'trade-up'].includes(previous.kind) &&
        Array.isArray(previous.cards) &&
        previous.cards.length &&
        previous.cards.every(
          (c: DuplicateInput) =>
            definitions.has(c.cardId) && Number.isInteger(c.count) && c.count > 0,
        )
      )
        setQuote(previous);
    } catch {}
  }, [profile?.id]);
  useEffect(() => {
    if (quote || result) dialog.current?.showModal();
    else dialog.current?.close();
  }, [quote, result]);
  const groups = [1, 2, 3, 4, 5].map((rarity) => {
    const copies = ALL_CARDS.filter((c) => c.rarity === rarity && (holo || c.finish !== 'holo'))
      .map((card) => ({
        card,
        count: Math.max(
          0,
          Math.min(
            (profile?.inventory[card.id]?.quantity ?? 0) - 1,
            profile?.inventory[card.id]?.available ?? 0,
          ),
        ),
      }))
      .filter((c) => c.count > 0);
    const total = copies.reduce((n, c) => n + c.count, 0);
    const batchTotal = copies.slice(0, 100).reduce((n, c) => n + c.count, 0);
    return { rarity, copies, total, batchTotal };
  });
  function prepare(kind: Quote['kind'], rarity: number) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved?.id && Array.isArray(saved.cards)) {
        setQuote(saved);
        return;
      }
    } catch {}
    const group = groups[rarity - 1];
    let left = kind === 'trade-up' ? Math.min(100, Math.floor(group.total / 5) * 5) : 1000;
    const cards: DuplicateInput[] = [];
    for (const entry of group.copies) {
      if (left <= 0 || cards.length >= 100) break;
      const count = Math.min(left, entry.count);
      cards.push({ cardId: entry.card.id, count });
      left -= count;
    }
    if (kind === 'trade-up') {
      let spare = cards.reduce((n, c) => n + c.count, 0) % 5;
      for (let i = cards.length - 1; i >= 0 && spare > 0; i--) {
        const n = Math.min(spare, cards[i].count);
        cards[i].count -= n;
        spare -= n;
      }
    }
    setError('');
    setQuote({ kind, cards: cards.filter((c) => c.count > 0) });
  }
  const total = quote?.cards.reduce((n, c) => n + c.count, 0) ?? 0;
  const prisms =
    quote?.cards.reduce(
      (n, c) => n + c.count * ECONOMY.recyclePrisms[definitions.get(c.cardId)!.rarity - 1],
      0,
    ) ?? 0;
  const rewards = result?.cards ?? (result?.card ? [result.card] : []);
  async function submit() {
    if (!profile || !quote || busy) return;
    setBusy(true);
    setError('');
    const pending = { ...quote, id: quote.id ?? crypto.randomUUID() };
    setQuote(pending);
    sessionStorage.setItem(key, JSON.stringify(pending));
    try {
      const receipt = await api<DuplicateResult>('/collection/duplicates', {
        kind: pending.kind,
        cards: pending.cards,
        requestId: pending.id,
      });
      sessionStorage.removeItem(key);
      setQuote(null);
      setResult(receipt);
      play(receipt.card ? 'victory' : 'menu');
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && [400, 403, 404, 409].includes(e.status)) {
        sessionStorage.removeItem(key);
        setQuote({ ...pending, id: undefined });
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocaleView>
      <details className="menu-window duplicate-tools">
        <summary>Duplicate cards · Recycle &amp; Trade Up</summary>
        <p>
          Choose a rarity, then recycle its spare copies or Trade Up in one batch. One copy of each
          card and all reserved copies are kept.
        </p>
        <label className="checkbox-label">
          <input
            name="duplicate-cards-input-1"
            type="checkbox"
            checked={holo}
            onChange={(e) => setHolo(e.target.checked)}
            disabled={busy}
          />
          Include Holographic duplicates
        </label>
        <div className="duplicate-groups">
          {groups.map((group) => (
            <section key={group.rarity} className="duplicate-group">
              <div>
                <strong>{'★'.repeat(group.rarity)}</strong>
                <span>{group.total} spare copies</span>
              </div>
              <div className="duplicate-actions">
                <button
                  className="outline-button"
                  disabled={busy || group.total === 0}
                  onClick={() => prepare('recycle', group.rarity)}
                >
                  Recycle · +
                  {Math.min(group.batchTotal, 1000) * ECONOMY.recyclePrisms[group.rarity - 1]} ◇
                </button>
                {group.rarity < 5 && (
                  <button
                    className="primary-button"
                    disabled={busy || group.total < 5}
                    onClick={() => prepare('trade-up', group.rarity)}
                  >
                    Trade Up ×{Math.min(20, Math.floor(group.batchTotal / 5))}
                  </button>
                )}
              </div>
              {group.total > 0 && (
                <details>
                  <summary>View duplicate cards</summary>
                  <div className="duplicate-preview">
                    {group.copies.map(({ card, count }) => (
                      <span key={card.id}>
                        <Avatar card={card} name={card.name} />
                        <NoTranslate>{card.name}</NoTranslate> ×{count}
                      </span>
                    ))}
                  </div>
                </details>
              )}
            </section>
          ))}
        </div>
        <dialog
          ref={dialog}
          className="game-dialog menu-window duplicate-dialog"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else {
              setQuote(null);
              setResult(null);
            }
          }}
        >
          <h2>
            {result
              ? rewards.length
                ? 'Trade Up complete'
                : 'Cards recycled'
              : quote?.kind === 'trade-up'
                ? 'Confirm Trade Up'
                : 'Confirm recycling'}
          </h2>
          {result ? (
            <>
              {rewards.length ? (
                <div className="duplicate-rewards">
                  {rewards.map((card, i) => (
                    <div key={i}>
                      <Card card={card} showElement />
                      <p>
                        <NoTranslate>{card.name}</NoTranslate>
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p>+{result.prisms} Stellar Prisms</p>
              )}
              <p>{result.consumed} duplicate copies used. Your remaining copies are kept.</p>
              <button className="primary-button" onClick={() => setResult(null)}>
                Continue
              </button>
            </>
          ) : (
            quote && (
              <>
                <p>{total} spare copies will be consumed.</p>
                <p>
                  {quote.kind === 'recycle' ? (
                    <>You receive {prisms} Stellar Prisms.</>
                  ) : (
                    <>
                      You receive {total / 5} random{' '}
                      {(definitions.get(quote.cards[0]?.cardId)?.rarity ?? 0) + 1}★ cards.
                    </>
                  )}
                </p>
                {quote.cards.some((c) => definitions.get(c.cardId)?.finish === 'holo') && (
                  <p className="deck-warning">This selection includes Holographic copies.</p>
                )}
                <div className="result-actions">
                  <button
                    className="primary-button"
                    disabled={busy || !total}
                    onClick={() => void submit()}
                  >
                    {busy ? 'Processing…' : quote.id ? 'Retry previous action' : 'Confirm'}
                  </button>
                  <button className="outline-button" disabled={busy} onClick={() => setQuote(null)}>
                    Cancel
                  </button>
                </div>
              </>
            )
          )}
          {error && <p role="alert">{error}</p>}
        </dialog>
      </details>
    </LocaleView>
  );
}
