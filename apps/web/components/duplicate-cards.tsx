'use client';
import { useEffect, useRef, useState } from 'react';
import { ALL_CARDS } from '@gacha-triad/shared';
import { ECONOMY, type DuplicateInput, type DuplicateResult } from '@gacha-triad/shared/platform';
import { useSession } from './session';
import { useGameAudio } from './game-shell';
import { Avatar } from './avatar';
import { Card } from './card';
import { api, ApiError } from '../lib/platform';
export function DuplicateCards() {
  const { profile, refresh } = useSession(),
    play = useGameAudio();
  const [kind, setKind] = useState<'recycle' | 'trade-up'>('recycle'),
    [rarity, setRarity] = useState(1),
    [holo, setHolo] = useState(false),
    [selection, setSelection] = useState<Record<string, number>>({}),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<DuplicateResult | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    tools = useRef<HTMLDetailsElement>(null),
    pending = useRef<{ id: string; cards: DuplicateInput[]; kind: 'recycle' | 'trade-up' } | null>(
      null,
    );
  useEffect(() => {
    setSelection({});
    setConfirm(false);
    setResult(null);
    pending.current = null;
    if (!profile) return;
    const saved = sessionStorage.getItem(`triad-duplicates:${profile.id}`);
    if (saved)
      try {
        const receipt = JSON.parse(saved);
        if (
          typeof receipt.id === 'string' &&
          ['recycle', 'trade-up'].includes(receipt.kind) &&
          Array.isArray(receipt.cards) &&
          receipt.cards.length &&
          receipt.cards.every(
            (c: DuplicateInput) =>
              ALL_CARDS.some((card) => card.id === c.cardId) &&
              Number.isInteger(c.count) &&
              c.count > 0,
          )
        ) {
          pending.current = receipt;
          if (tools.current) tools.current.open = true;
          setKind(receipt.kind);
          setRarity(ALL_CARDS.find((c) => c.id === receipt.cards[0].cardId)!.rarity);
          setHolo(
            receipt.cards.some(
              (c: DuplicateInput) => ALL_CARDS.find((card) => card.id === c.cardId)?.finish,
            ),
          );
          setConfirm(true);
        }
      } catch {}
  }, [profile?.id]);
  useEffect(() => {
    setSelection({});
  }, [kind, rarity, holo]);
  useEffect(() => {
    if (confirm || result) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirm, result]);
  const duplicates = ALL_CARDS.map((card) => ({
    card,
    count: Math.max(
      0,
      Math.min(
        (profile?.inventory[card.id]?.quantity ?? 0) - 1,
        profile?.inventory[card.id]?.available ?? 0,
      ),
    ),
  })).filter(({ card, count }) => count > 0 && card.rarity === rarity && (holo || !card.finish));
  const selected =
    pending.current?.cards ??
    Object.entries(selection)
      .filter(([, count]) => count > 0)
      .map(([cardId, count]) => ({ cardId, count }));
  const total = selected.reduce((s, c) => s + c.count, 0),
    prisms = total * ECONOMY.recyclePrisms[rarity - 1];
  const valid =
    total > 0 &&
    total <= 1000 &&
    (kind === 'recycle' || total === 5) &&
    selected.every(
      (c) =>
        Number.isInteger(c.count) &&
        c.count <= (duplicates.find((d) => d.card.id === c.cardId)?.count ?? 0),
    );
  async function submit() {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    const key = `triad-duplicates:${profile.id}`;
    try {
      if (!pending.current) pending.current = { id: crypto.randomUUID(), cards: selected, kind };
      sessionStorage.setItem(key, JSON.stringify(pending.current));
      const receipt = await api<DuplicateResult>('/collection/duplicates', {
        requestId: pending.current.id,
        kind: pending.current.kind,
        cards: pending.current.cards,
      });
      sessionStorage.removeItem(key);
      pending.current = null;
      setResult(receipt);
      setConfirm(false);
      setSelection({});
      play(receipt.card ? 'victory' : 'menu');
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem(key);
        pending.current = null;
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="menu-window duplicate-tools" ref={tools}>
      <summary>Duplicate cards · Recycle &amp; Trade Up</summary>
      <p>
        Keep one copy of each card. Only spare, unreserved copies can be used. Holo copies are
        excluded unless you enable them.
      </p>
      <div className="duplicate-toolbar">
        <label>
          Action
          <select
            aria-label="Duplicate action"
            value={kind}
            disabled={busy || !!pending.current}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              if (e.target.value === 'trade-up' && rarity === 5) setRarity(4);
            }}
          >
            <option value="recycle">Recycle for Prisms</option>
            <option value="trade-up">Trade Up</option>
          </select>
        </label>
        <label>
          Rarity
          <select
            aria-label="Duplicate rarity"
            value={rarity}
            disabled={busy || !!pending.current}
            onChange={(e) => setRarity(Number(e.target.value))}
          >
            {Array.from({ length: kind === 'trade-up' ? 4 : 5 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}★
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={holo}
            disabled={busy || !!pending.current}
            onChange={(e) => setHolo(e.target.checked)}
          />
          Include Holo duplicates
        </label>
      </div>
      <p>
        {kind === 'recycle'
          ? `${ECONOMY.recyclePrisms[rarity - 1]} Stellar Prisms per ${rarity}★ copy.`
          : `Choose five ${rarity}★ spare copies for one random ${rarity + 1}★ card. Mixed characters allowed · 0.1% Holo chance.`}
      </p>
      {!duplicates.length && <p>No available duplicates of this rarity.</p>}
      <div className="duplicate-list">
        {duplicates.map(({ card, count }) => (
          <div key={card.id} className="duplicate-row">
            <Avatar card={card} name={card.name} />
            <div>
              <strong>
                {card.name}
                {card.finish ? ' · Holo' : ''}
              </strong>
              <small>
                {count} spare copies · {profile?.inventory[card.id]?.quantity} owned
              </small>
            </div>
            <input
              type="number"
              aria-label={`Copies of ${card.name}${card.finish ? ' Holo' : ''}`}
              min={0}
              max={Math.min(count, kind === 'trade-up' ? 5 : 1000)}
              value={selection[card.id] ?? 0}
              disabled={busy || !!pending.current}
              onChange={(e) =>
                setSelection({
                  ...selection,
                  [card.id]: Math.max(0, Math.min(count, Number(e.target.value) || 0)),
                })
              }
            />
          </div>
        ))}
      </div>
      <div className="result-actions">
        <button
          className="outline-button"
          disabled={busy || !!pending.current || !duplicates.length}
          onClick={() => {
            let left = kind === 'trade-up' ? 5 : 1000;
            const next: Record<string, number> = {};
            for (const { card, count } of duplicates) {
              next[card.id] = Math.min(count, left);
              left -= next[card.id];
            }
            setSelection(next);
          }}
        >
          {kind === 'trade-up' ? 'Select five spares' : 'Select spares of this rarity'}
        </button>
        <span>
          {total} copies selected{kind === 'recycle' ? ` · ${prisms} Prisms` : ' / 5'}
        </span>
        <button
          className="primary-button"
          disabled={busy || (!valid && !pending.current)}
          onClick={() => {
            const saved = sessionStorage.getItem(`triad-duplicates:${profile?.id}`);
            if (saved) {
              try {
                pending.current = JSON.parse(saved);
              } catch {}
            }
            setError('');
            setConfirm(true);
          }}
        >
          {pending.current
            ? 'Retry previous action'
            : kind === 'recycle'
              ? 'Recycle selected'
              : 'Trade Up selected'}
        </button>
      </div>
      <dialog
        ref={dialog}
        className="game-dialog menu-window duplicate-dialog"
        aria-labelledby="duplicate-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else {
            setConfirm(false);
            setResult(null);
          }
        }}
      >
        <h2 id="duplicate-title">
          {result
            ? result.card
              ? 'Trade Up complete'
              : 'Cards recycled'
            : kind === 'recycle'
              ? 'Recycle these copies?'
              : 'Trade Up these copies?'}
        </h2>
        {result ? (
          <>
            {result.card ? (
              <div className="duplicate-reward">
                <Card card={result.card} showElement />
                <p>
                  {result.card.name} · {result.card.rarity}★
                  {result.card.finish ? ' · Holographic' : ''}
                </p>
              </div>
            ) : (
              <p>+{result.prisms} Stellar Prisms</p>
            )}
            <p>{result.consumed} duplicate copies used. Your remaining copies are kept.</p>
            <button
              className="primary-button"
              onClick={() => {
                setResult(null);
                setConfirm(false);
              }}
            >
              Continue
            </button>
          </>
        ) : (
          <>
            <p>
              {pending.current
                ? 'Confirming your previous request. A completed action returns its saved result without consuming copies again. '
                : ''}
              {total} spare copies will be permanently consumed.{' '}
              {kind === 'recycle'
                ? `You receive ${prisms} Stellar Prisms.`
                : `You receive one random ${rarity + 1}★ card.`}
            </p>
            {selected.some((c) => ALL_CARDS.find((card) => card.id === c.cardId)?.finish) && (
              <p className="deck-warning">This selection includes Holographic copies.</p>
            )}
            <div className="result-actions">
              <button className="primary-button" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Processing…' : 'Confirm'}
              </button>
              <button className="outline-button" disabled={busy} onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          </>
        )}
        <p className="error-message" role="alert">
          {error}
        </p>
      </dialog>
    </details>
  );
}
