'use client';
import { useEffect, useRef, useState } from 'react';
import { ECONOMY, type BoosterView, type DailyBooster } from '@gacha-triad/shared/platform';
import { BoosterOpening } from '../../components/booster-opening';
import { useSession } from '../../components/session';
import { useGameAudio } from '../../components/game-shell';
import { api, ApiError } from '../../lib/platform';
import { BatchBoosterOpening } from '../../components/batch-booster-opening';
function savedPurchase(key: string): { id: string; quantity: number } | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      typeof value.id === 'string' &&
      /^[a-zA-Z0-9-]{8,80}$/.test(value.id) &&
      Number.isInteger(value.quantity) &&
      value.quantity >= 1 &&
      value.quantity <= 100
    )
      return value;
  } catch {
    if (/^[a-zA-Z0-9-]{8,80}$/.test(raw)) return { id: raw, quantity: 1 };
  }
  sessionStorage.removeItem(key);
  return null;
}

export default function Boosters() {
  const { profile, revision, refresh } = useSession(),
    play = useGameAudio();
  const [packs, setPacks] = useState<BoosterView[]>([]),
    [receipt, setReceipt] = useState<BoosterView | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [buyOpen, setBuyOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [daily, setDaily] = useState<DailyBooster | null>(null),
    [batch, setBatch] = useState<BoosterView[] | null>(null);
  const pendingPurchase = useRef<{ id: string; quantity: number } | null>(null);
  const buyDialog = useRef<HTMLDialogElement>(null);
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
    void api<DailyBooster>('/boosters/daily')
      .then((next) => {
        if (active) setDaily(next);
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
    setQuantity(1);
    setDaily(null);
    setBatch(null);
    pendingPurchase.current = null;
    if (profile) {
      const pending = savedPurchase(`triad-booster-purchase:${profile.id}`);
      if (pending) {
        pendingPurchase.current = pending;
        setQuantity(pending.quantity);
        setBuyOpen(true);
      }
    }
  }, [profile?.id]);
  useEffect(() => {
    if (buyOpen) buyDialog.current?.showModal();
  }, [buyOpen]);
  function open(pack: BoosterView) {
    setReceipt(pack);
  }
  async function buy() {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    try {
      const key = `triad-booster-purchase:${profile.id}`;
      if (!pendingPurchase.current) {
        pendingPurchase.current = savedPurchase(key);
        if (!pendingPurchase.current || pendingPurchase.current.quantity !== quantity)
          pendingPurchase.current = { id: crypto.randomUUID(), quantity };
      }
      sessionStorage.setItem(key, JSON.stringify(pendingPurchase.current));
      await api('/boosters/buy', {
        requestId: pendingPurchase.current.id,
        quantity: pendingPurchase.current.quantity,
      });
      sessionStorage.removeItem(key);
      pendingPurchase.current = null;
      buyDialog.current?.close();
      setBuyOpen(false);
      play('menu');
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem(`triad-booster-purchase:${profile.id}`);
        pendingPurchase.current = null;
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const unopened = packs.filter((p) => !p.openedAt),
    history = packs.filter((p) => p.openedAt);
  const stacks = (['starter', 'daily', 'purchase', 'admin'] as const)
    .map((source) => ({ source, packs: unopened.filter((p) => p.source === source) }))
    .filter((s) => s.packs.length);
  const maxQuantity = Math.min(100, Math.floor((profile?.prisms ?? 0) / ECONOMY.packCost));
  const totalCost = quantity * ECONOMY.packCost;
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
      <section className="menu-window daily-booster">
        <div>
          <h2>Daily free booster</h2>
          <p>
            {!profile?.registered
              ? 'Register an account to claim one free booster every day.'
              : daily?.available
                ? 'One standard booster, on the house.'
                : 'Today’s booster is claimed.'}
          </p>
          {daily && (
            <small>Resets at {new Date(daily.resetAt).toLocaleString()} · midnight UTC</small>
          )}
        </div>
        <button
          className="outline-button"
          disabled={busy || !daily?.available}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              await api('/boosters/daily', {});
              play('menu');
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {daily?.packId ? 'Claimed today' : 'Claim daily booster'}
        </button>
      </section>
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
            disabled={
              busy || !profile || (!pendingPurchase.current && profile.prisms < ECONOMY.packCost)
            }
            onClick={() => {
              const saved = savedPurchase(`triad-booster-purchase:${profile?.id}`);
              if (saved) {
                pendingPurchase.current = saved;
                setQuantity(saved.quantity);
              } else {
                pendingPurchase.current = null;
                setQuantity(1);
              }
              setBuyOpen(true);
            }}
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
          {stacks.map(({ source, packs: stack }) => (
            <div className="booster-stack" key={source}>
              <button
                className="menu-window booster-pack-button"
                disabled={busy}
                onClick={() => void open(stack[0])}
                aria-label={`Open ${source === 'starter' ? 'starter' : source === 'daily' ? 'daily' : source === 'admin' ? 'gift' : 'standard'} booster (${stack.length} available)`}
              >
                <span className={`booster-stack-art ${stack.length > 1 ? 'has-multiple' : ''}`}>
                  <span className="booster-pack-art" aria-hidden="true">
                    <span>GT</span>
                    <b>BOOSTER</b>
                    <i>★★★★★</i>
                  </span>
                  <b className="booster-count" aria-label={`${stack.length} unopened boosters`}>
                    ×{stack.length}
                  </b>
                </span>
                <strong>
                  {source === 'starter'
                    ? 'Starter booster'
                    : source === 'daily'
                      ? 'Daily booster'
                      : source === 'admin'
                        ? 'Gift booster'
                        : 'Standard booster'}
                </strong>
                <span>Open · 5 cards</span>
              </button>
              {stack.length >= 5 && (
                <div className="batch-open-actions">
                  {[5, 10].map((n) => (
                    <button
                      key={n}
                      className="outline-button"
                      disabled={busy || stack.length < n}
                      onClick={() => setBatch(stack.slice(0, n))}
                    >
                      Open ×{n}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                View{' '}
                {p.source === 'starter'
                  ? 'starter'
                  : p.source === 'daily'
                    ? 'daily'
                    : p.source === 'admin'
                      ? 'gift'
                      : 'standard'}{' '}
                booster · {new Date(p.openedAt!).toLocaleString()}
              </button>
            ))}
          </div>
        </section>
      )}
      {receipt && (
        <BoosterOpening
          pack={receipt}
          onClose={() => setReceipt(null)}
          onNext={
            unopened.some((p) => p.id !== receipt.id)
              ? () => setReceipt(unopened.find((p) => p.id !== receipt.id)!)
              : undefined
          }
        />
      )}
      {batch && <BatchBoosterOpening packs={batch} onClose={() => setBatch(null)} />}
      {buyOpen && (
        <dialog
          ref={buyDialog}
          className="game-dialog menu-window"
          aria-labelledby="booster-buy-title"
          onCancel={() => setBuyOpen(false)}
        >
          <h2 id="booster-buy-title">Buy boosters</h2>
          <label className="booster-quantity">
            Quantity
            <input
              type="number"
              aria-label="Booster quantity"
              min={1}
              max={Math.max(1, maxQuantity)}
              value={quantity}
              disabled={busy || !!pendingPurchase.current}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          {pendingPurchase.current && (
            <p>Retrying your previous purchase of {pendingPurchase.current.quantity} booster(s).</p>
          )}
          {!pendingPurchase.current && (
            <div className="quantity-shortcuts">
              {[1, 5, 10].map((n) => (
                <button
                  key={n}
                  className="outline-button"
                  disabled={busy || n > maxQuantity}
                  onClick={() => setQuantity(n)}
                >
                  {n}
                </button>
              ))}
              <button
                className="text-button"
                disabled={busy || maxQuantity < 1}
                onClick={() => setQuantity(maxQuantity)}
              >
                Max ({maxQuantity})
              </button>
            </div>
          )}
          <p>
            Spend {Number.isFinite(totalCost) ? totalCost : 0} Stellar Prisms for {quantity} booster
            {quantity === 1 ? '' : 's'}. Each contains five cards, with at least one 3★ or higher.
          </p>
          <p>
            {pendingPurchase.current
              ? `Current balance: ${profile?.prisms ?? 0}`
              : `Balance after purchase: ${(profile?.prisms ?? 0) - (totalCost || 0)}`}{' '}
            Stellar Prisms.
          </p>
          <div className="result-actions">
            <button
              className="primary-button"
              disabled={
                busy ||
                !Number.isInteger(quantity) ||
                quantity < 1 ||
                quantity > 100 ||
                (!pendingPurchase.current && totalCost > (profile?.prisms ?? 0))
              }
              onClick={() => void buy()}
            >
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
