'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BOOSTER_TYPES,
  ECONOMY,
  type BoosterType,
  type BoosterView,
  type DailyBooster,
} from '@gacha-triad/shared/platform';
import { AutomaticBoosterOpening } from '../../components/automatic-booster-opening';
import { useSession } from '../../components/session';
import { useGameAudio } from '../../components/game-shell';
import { api, ApiError } from '../../lib/platform';
import { assetPath } from '../../lib/connection';
type Purchase = { id: string; quantity: number; type: BoosterType };
function pendingPurchase(key: string): Purchase | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      value &&
      typeof value.id === 'string' &&
      /^[a-zA-Z0-9-]{8,80}$/.test(value.id) &&
      Number.isInteger(value.quantity) &&
      value.quantity >= 1 &&
      value.quantity <= 100 &&
      BOOSTER_TYPES.some((t) => t.id === (value.type ?? 'standard') && t.id !== 'starter')
    )
      return { ...value, type: value.type ?? 'standard' };
  } catch {}
  return null;
}
export default function Boosters() {
  const { profile, revision, refresh } = useSession(),
    play = useGameAudio();
  const [packs, setPacks] = useState<BoosterView[]>([]),
    [daily, setDaily] = useState<DailyBooster | null>(null),
    [opening, setOpening] = useState<BoosterView[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<BoosterType>('standard'),
    [quantity, setQuantity] = useState(1),
    [amount, setAmount] = useState('all'),
    [modal, setModal] = useState<'buy' | 'odds' | 'history' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    purchase = useRef<Purchase | null>(null),
    resumed = useRef(false);
  const purchaseKey = `triad-booster-purchase:${profile?.id}`;
  useEffect(() => {
    setPacks([]);
    setOpening(null);
    setError('');
    setModal(null);
    resumed.current = false;
    purchase.current = profile ? pendingPurchase(purchaseKey) : null;
    if (purchase.current) {
      setSelected(purchase.current.type);
      setQuantity(purchase.current.quantity);
      setModal('buy');
    }
  }, [profile?.id]);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    void Promise.all([api<BoosterView[]>('/boosters'), api<DailyBooster>('/boosters/daily')])
      .then(([next, daily]) => {
        if (!active) return;
        setPacks(next);
        setDaily(daily);
        if (resumed.current) return;
        resumed.current = true;
        try {
          const saved = JSON.parse(sessionStorage.getItem(`triad-opening:${profile.id}`) ?? 'null');
          if (saved && Array.isArray(saved.ids) && saved.ids.length <= 10) {
            const selected = saved.ids.map((id: string) => next.find((p) => p.id === id));
            if (selected.length && selected.every(Boolean)) {
              setOpening(selected);
              return;
            }
          }
        } catch {}
        if (new URLSearchParams(location.search).get('starter') === '1') {
          const starters = next.filter((p) => p.type === 'starter' && !p.openedAt);
          if (starters.length) setOpening(starters.slice(0, 10));
          history.replaceState(history.state, '', location.pathname);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [profile?.id, revision]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
  }, [modal]);
  const unopened = packs.filter((p) => !p.openedAt),
    recent = packs.filter((p) => p.openedAt),
    cost = quantity * ECONOMY.packCost;
  const selectedType = BOOSTER_TYPES.find((type) => type.id === selected)!;
  function begin(packs: BoosterView[]) {
    resumed.current = true;
    setOpening(packs.slice(0, 10));
  }
  async function buy() {
    if (busy || !profile) return;
    setBusy(true);
    setError('');
    try {
      purchase.current ??= { id: crypto.randomUUID(), quantity, type: selected };
      sessionStorage.setItem(purchaseKey, JSON.stringify(purchase.current));
      await api('/boosters/buy', {
        requestId: purchase.current.id,
        quantity: purchase.current.quantity,
        type: purchase.current.type,
      });
      sessionStorage.removeItem(purchaseKey);
      purchase.current = null;
      setModal(null);
      play('menu');
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem(purchaseKey);
        purchase.current = null;
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-page boosters-page booster-hall">
      <header className="booster-hall-heading">
        <div>
          <div className="eyebrow">THE CARD SHOP</div>
          <h1>Boosters</h1>
        </div>
        <strong className="prism-balance" aria-label="Stellar Prisms balance">
          ◇ {profile?.prisms ?? 0} <span>Stellar Prisms</span>
        </strong>
      </header>
      <div className="booster-hall-toolbar">
        <span>
          Your packs <b>{unopened.length}</b>
        </span>
        <label>
          Open at a time{' '}
          <select
            aria-label="Boosters to open"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          >
            <option value="all">All · up to 10</option>
            <option value="1">1</option>
            <option value="5">5</option>
            <option value="10">10</option>
          </select>
        </label>
        {unopened.length > 1 && (
          <button
            className="outline-button"
            disabled={busy}
            onClick={() => begin(unopened.slice(0, amount === 'all' ? 10 : Number(amount)))}
          >
            Open {Math.min(unopened.length, amount === 'all' ? 10 : Number(amount))} packs
          </button>
        )}
        <button
          className="outline-button daily-claim-button"
          disabled={busy || !daily?.available}
          title={
            !profile?.registered ? 'Register to claim a free daily Universe I booster' : undefined
          }
          onClick={async () => {
            setBusy(true);
            try {
              await api('/boosters/daily', {});
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {daily?.packId ? 'Daily claimed' : 'Claim daily booster'}
        </button>
      </div>
      <p className="error-message" role="alert">
        {error}
      </p>
      <section className="booster-type-grid" aria-label="Booster types">
        {BOOSTER_TYPES.map((type) => {
          const owned = unopened.filter((p) => p.type === type.id),
            n = Math.min(owned.length, amount === 'all' ? 10 : Number(amount));
          return (
            <article
              key={type.id}
              className={`booster-type-tile menu-window ${type.id === 'starter' ? 'starter-type-tile' : ''}`}
              style={{ '--booster-accent': type.color } as CSSProperties}
            >
              <div
                className={`booster-tile-art ${type.artwork ? 'has-pack-image' : ''}`}
                aria-hidden="true"
              >
                <img
                  src={assetPath(type.artwork ?? '/assets/ui/triad-logo.webp')}
                  alt=""
                  draggable={false}
                />
                <span>
                  {type.id === 'starter'
                    ? 'STARTER'
                    : type.id === 'standard'
                      ? 'UNIVERSE I'
                      : 'UNIVERSE II'}
                </span>
                <small>5 CARDS</small>
                {owned.length > 0 && <b className="booster-count">×{owned.length}</b>}
              </div>
              <div className="booster-tile-details">
                <h2>{type.name}</h2>
                <p>
                  {type.id === 'starter'
                    ? 'First three only · 1–4★'
                    : type.id === 'standard'
                      ? 'Genshin · HSR · ZZZ · WuWa'
                      : 'Epic Seven · Star Savior · NTE · Endfield'}
                </p>
                <small>One guaranteed 3★+</small>
                <div className="booster-tile-actions">
                  {owned.length > 0 && (
                    <button
                      className="primary-button"
                      disabled={busy}
                      aria-label={`Open ${type.name} (${n} of ${owned.length} available)`}
                      onClick={() => begin(owned.slice(0, n))}
                    >
                      Open ×{n}
                    </button>
                  )}
                  {type.id !== 'starter' ? (
                    <button
                      className="outline-button"
                      aria-label={`Buy ${type.name}`}
                      disabled={busy || !profile || profile.prisms < ECONOMY.packCost}
                      onClick={() => {
                        setSelected(type.id);
                        setQuantity(1);
                        purchase.current = null;
                        setModal('buy');
                      }}
                    >
                      Buy · ◇ {ECONOMY.packCost}
                    </button>
                  ) : (
                    <span className="starter-exclusive">
                      {owned.length ? 'Onboarding exclusive' : 'Not for sale'}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
      <footer className="booster-hall-footer">
        <button className="text-button" onClick={() => setModal('odds')}>
          Pack odds
        </button>
        <button
          className="text-button"
          disabled={!recent.length}
          onClick={() => setModal('history')}
        >
          Recent openings
        </button>
      </footer>
      {opening && (
        <AutomaticBoosterOpening
          key={opening.map((p) => p.id).join(',')}
          packs={opening}
          onClose={() => setOpening(null)}
        />
      )}
      {modal && (
        <dialog
          ref={dialog}
          className="game-dialog menu-window booster-shop-dialog"
          aria-labelledby="booster-dialog-title"
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setModal(null);
          }}
        >
          <h2 id="booster-dialog-title">
            {modal === 'buy'
              ? `Buy ${selectedType.name}s`
              : modal === 'odds'
                ? 'Booster odds'
                : 'Recent openings'}
          </h2>
          {modal === 'buy' && (
            <>
              <label className="booster-quantity">
                Quantity
                <input
                  type="number"
                  aria-label="Booster quantity"
                  value={quantity}
                  min={1}
                  max={100}
                  disabled={busy || !!purchase.current}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </label>
              <div className="quantity-shortcuts">
                {[1, 5, 10].map((n) => (
                  <button
                    key={n}
                    className="outline-button"
                    disabled={busy || !!purchase.current || n * 150 > (profile?.prisms ?? 0)}
                    onClick={() => setQuantity(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p>
                {quantity} packs · {quantity * 5} cards · ◇ {Number.isFinite(cost) ? cost : 0}
              </p>
              <p>Balance after purchase: {(profile?.prisms ?? 0) - (cost || 0)} Stellar Prisms.</p>
              {purchase.current && (
                <p>
                  Retrying the saved purchase of {purchase.current.quantity} {selectedType.name}s.
                </p>
              )}
              <button
                className="primary-button"
                disabled={
                  busy ||
                  !Number.isInteger(quantity) ||
                  quantity < 1 ||
                  quantity > 100 ||
                  (!purchase.current && cost > (profile?.prisms ?? 0))
                }
                onClick={() => void buy()}
              >
                {busy ? 'Purchasing…' : 'Confirm purchase'}
              </button>
            </>
          )}
          {modal === 'odds' && (
            <div className="booster-odds-copy">
              <p>
                Universe I and II boosters: 1★ 50%, 2★ 27%, 3★ 17%, 4★ 5%, 5★ 1%. The fifth slot: 3★
                80%, 4★ 17%, 5★ 3%. Holo: 0.5% per card.
              </p>
              <p>
                Starter: 1★ 50%, 2★ 35%, 3★ 10%, 4★ 5%. The fifth slot guarantees 3★/4★ with 2:1
                weights. Holo: 1%. No 5★ cards; only the first three free boosters.
              </p>
              <p>
                Five distinct characters per pack. Holo adds +1 to one randomly chosen side below A;
                that direction stays fixed through trades and decks.
              </p>
              <p>
                Universe I: Genshin, Star Rail, ZZZ and Wuthering Waves. Universe II: Epic Seven,
                Star Savior, NTE and Endfield. Each pack draws only from its own four universes.
              </p>
            </div>
          )}
          {modal === 'history' && (
            <div className="booster-history">
              {recent.map((pack) => (
                <button
                  key={pack.id}
                  className="outline-button"
                  onClick={() => {
                    setModal(null);
                    begin([pack]);
                  }}
                >
                  View {BOOSTER_TYPES.find((t) => t.id === pack.type)?.name} ·{' '}
                  {new Date(pack.openedAt!).toLocaleString()}
                </button>
              ))}
            </div>
          )}
          <div className="result-actions">
            <button className="outline-button" disabled={busy} onClick={() => setModal(null)}>
              {modal === 'buy' ? 'Cancel' : 'Close'}
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </dialog>
      )}
    </div>
  );
}
