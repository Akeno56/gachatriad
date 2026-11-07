'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ECONOMY, type BoosterView } from '@gacha-triad/shared/platform';
import { Card } from '../../components/card';
import { useSession } from '../../components/session';
import { useGameAudio } from '../../components/game-shell';
import { api } from '../../lib/platform';

export default function Boosters() {
  const { profile, revision, refresh } = useSession(),
    play = useGameAudio();
  const [packs, setPacks] = useState<BoosterView[]>([]),
    [receipt, setReceipt] = useState<BoosterView | null>(null);
  const [revealed, setRevealed] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [buyOpen, setBuyOpen] = useState(false);
  const revealDialog = useRef<HTMLDialogElement>(null),
    buyDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    void api<BoosterView[]>('/boosters')
      .then((p) => {
        if (active) setPacks(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [profile?.id, revision]);
  useEffect(() => {
    setReceipt(null);
    setPacks([]);
    setError('');
    setBuyOpen(false);
  }, [profile?.id]);
  useEffect(() => {
    if (receipt) revealDialog.current?.showModal();
  }, [receipt]);
  useEffect(() => {
    if (buyOpen) buyDialog.current?.showModal();
  }, [buyOpen]);
  async function open(pack: BoosterView) {
    setBusy(true);
    setError('');
    try {
      const next = pack.openedAt ? pack : await api<BoosterView>(`/boosters/${pack.id}/open`, {});
      setReceipt(next);
      setRevealed([]);
      play('select');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function buy() {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    try {
      const key = `triad-booster-purchase:${profile.id}`;
      const requestId = sessionStorage.getItem(key) || crypto.randomUUID();
      sessionStorage.setItem(key, requestId);
      await api<BoosterView>('/boosters/buy', { requestId });
      sessionStorage.removeItem(key);
      buyDialog.current?.close();
      setBuyOpen(false);
      play('menu');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const unopened = packs.filter((p) => !p.openedAt),
    history = packs.filter((p) => p.openedAt);
  return (
    <div className="content-page boosters-page">
      <div className="booster-heading">
        <h1>Boosters</h1>
        <strong className="prism-balance" aria-label="Stellar Prisms balance">
          ◇ {profile?.prisms ?? 0} <span>Stellar Prisms</span>
        </strong>
      </div>
      <p>
        Five cards per booster. At least one is 3★ or higher. Cards go straight into your collection
        when opened.
      </p>
      <p className="error-message" role="alert">
        {error}
      </p>
      <section className="menu-window booster-shop">
        <div className="booster-pack-art" aria-hidden="true">
          <span>GT</span>
          <b>BOOSTER</b>
          <i>★★★★★</i>
        </div>
        <div>
          <h2>Standard booster</h2>
          <p>Five cards · one guaranteed 3★ or higher</p>
          <p>
            Price: <strong>{ECONOMY.packCost} Stellar Prisms</strong>
          </p>
          <button
            className="primary-button"
            disabled={busy || !profile || profile.prisms < ECONOMY.packCost}
            onClick={() => setBuyOpen(true)}
          >
            Buy booster
          </button>
          {profile && profile.prisms < ECONOMY.packCost && (
            <p>
              Complete duels to earn Stellar Prisms: 50 for a win, 25 for a draw, 10 for a loss.
            </p>
          )}
          <small>
            Forfeits and abandoned drafts do not award currency. Guests can earn and spend; register
            to keep your progress.
          </small>
        </div>
      </section>
      <section className="booster-inventory">
        <h2>
          Your unopened boosters <span>({unopened.length})</span>
        </h2>
        <div className="booster-pack-list">
          {unopened.map((p, i) => (
            <button
              className="menu-window booster-pack-button"
              disabled={busy}
              key={p.id}
              onClick={() => void open(p)}
              aria-label={`Open ${p.source === 'starter' ? 'starter' : 'standard'} booster ${i + 1}`}
            >
              <span className="booster-pack-art" aria-hidden="true">
                <span>GT</span>
                <b>BOOSTER</b>
                <i>★★★★★</i>
              </span>
              <strong>{p.source === 'starter' ? 'Starter booster' : 'Standard booster'}</strong>
              <span>Open · 5 cards</span>
            </button>
          ))}
        </div>
        {!unopened.length && <p>No unopened boosters.</p>}
      </section>
      <details className="menu-window booster-odds">
        <summary>Card odds &amp; pack contents</summary>
        <p>
          Standard boosters: each of the first four slots rolls 1★ 55%, 2★ 25%, 3★ 15%, 4★ 4%, 5★
          1%. The guaranteed slot rolls 3★ 85%, 4★ 13%, 5★ 2%. Characters of the rolled rarity have
          equal chances.
        </p>
        <p>
          Each card independently has a 0.1% chance to be Holographic. Holo changes appearance only.
          Each pack contains five different characters; duplicates across packs add copies.
        </p>
        <p>
          Your three free starter boosters use 1–3★ cards for their first four slots (55:25:15
          weights), favoring characters you do not already own, plus the same guaranteed 3–5★ slot.
          This ensures a playable first deck. Existing collections stay intact.
        </p>
      </details>
      {history.length > 0 && (
        <section>
          <h2>Recently opened</h2>
          <div className="booster-history">
            {history.map((p) => (
              <button
                key={p.id}
                className="outline-button"
                disabled={busy}
                onClick={() => void open(p)}
              >
                View {p.source === 'starter' ? 'starter' : 'standard'} booster ·{' '}
                {new Date(p.openedAt!).toLocaleString()}
              </button>
            ))}
          </div>
        </section>
      )}
      {receipt && (
        <dialog
          ref={revealDialog}
          className="game-dialog menu-window booster-reveal"
          aria-labelledby="booster-reveal-title"
          onCancel={() => setReceipt(null)}
        >
          <div className="booster-heading">
            <h2 id="booster-reveal-title">Your five cards</h2>
            <span>Added to Collection</span>
          </div>
          <div className="booster-reveal-cards">
            {receipt.cards.map((card, i) => (
              <button
                key={card.id}
                className={`booster-card-reveal ${revealed.includes(i) ? 'is-revealed' : ''}`}
                onClick={() => {
                  if (!revealed.includes(i)) {
                    setRevealed([...revealed, i]);
                    play(card.rarity >= 4 ? 'victory' : 'select');
                  }
                }}
                aria-label={
                  revealed.includes(i)
                    ? `${card.name}, ${card.rarity} stars${card.finish === 'holo' ? ', Holographic' : ''}`
                    : `Reveal card ${i + 1}`
                }
              >
                {revealed.includes(i) ? (
                  <Card card={card} showElement />
                ) : (
                  <span className="booster-card-back">
                    <b>GT</b>
                    <span>{i === 4 ? '3★ OR HIGHER' : 'REVEAL'}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="result-actions">
            <button
              className="primary-button"
              disabled={revealed.length === 5}
              onClick={() => {
                setRevealed([0, 1, 2, 3, 4]);
                play('victory');
              }}
            >
              Reveal all
            </button>
            <button
              className="outline-button"
              onClick={() => {
                revealDialog.current?.close();
                setReceipt(null);
              }}
            >
              Continue
            </button>
            <Link className="text-button" href="/collection">
              Go to Collection
            </Link>
          </div>
        </dialog>
      )}
      {buyOpen && (
        <dialog
          ref={buyDialog}
          className="game-dialog menu-window"
          aria-labelledby="booster-buy-title"
          onCancel={() => setBuyOpen(false)}
        >
          <h2 id="booster-buy-title">Buy one booster?</h2>
          <p>
            Spend {ECONOMY.packCost} Stellar Prisms for five cards, with at least one 3★ or higher.
          </p>
          <p>Balance after purchase: {(profile?.prisms ?? 0) - ECONOMY.packCost} Stellar Prisms.</p>
          <div className="result-actions">
            <button className="primary-button" disabled={busy} onClick={() => void buy()}>
              {busy ? 'Purchasing…' : 'Confirm purchase'}
            </button>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => {
                buyDialog.current?.close();
                setBuyOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </dialog>
      )}
    </div>
  );
}
