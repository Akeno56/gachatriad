'use client';
import { LocaleView, NoTranslate } from '../../components/i18n';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ALL_CARDS as CARDS, UNIVERSES, universeName, SIDE_NAMES } from '@gacha-triad/shared';
import type { TradeOfferView } from '@gacha-triad/shared/platform';
import { useSession } from '../../components/session';
import { LocalBots } from '../../components/local-bots';
import { Card } from '../../components/card';
import { api } from '../../lib/platform';
import { MainChat } from '../../components/main-chat';
export default function Market() {
  const { profile, revision, refresh, error: connectionError, openAccount } = useSession();
  const [offers, setOffers] = useState<TradeOfferView[]>([]),
    [offered, setOffered] = useState(''),
    [wanted, setWanted] = useState(''),
    [payment, setPayment] = useState('exchange'),
    [price, setPrice] = useState('236'),
    [listingType, setListingType] = useState('all'),
    [minPrice, setMinPrice] = useState(''),
    [maxPrice, setMaxPrice] = useState(''),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [finish, setFinish] = useState('all'),
    [rarity, setRarity] = useState('all'),
    [wantedRarity, setWantedRarity] = useState('all'),
    [universe, setUniverse] = useState('all'),
    [sort, setSort] = useState('newest'),
    [onlyMissing, setOnlyMissing] = useState(false),
    [onlyDuplicates, setOnlyDuplicates] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<TradeOfferView | null>(null);
  useEffect(() => {
    if (profile)
      void api<TradeOfferView[]>('/trades?includeSales=true')
        .then((rows) => setOffers(rows.map((o) => ({ ...o, price: o.price ?? null }))))
        .catch((e) => setError(e.message));
  }, [profile?.id, revision]);
  const confirmRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) confirmRef.current?.showModal();
    else confirmRef.current?.close();
  }, [selected]);
  const owned = CARDS.filter((c) => (profile?.inventory[c.id]?.available ?? 0) > 0),
    canAccept = (o: TradeOfferView) =>
      !!profile?.registered &&
      !profile.profiles.some((p) => p.id === o.ownerId) &&
      (o.price !== null
        ? profile.prisms >= o.price
        : !!o.wanted && (profile.inventory[o.wanted.id]?.available ?? 0) > 0),
    visible = offers
      .filter(
        (o) =>
          (
            o.offered.name +
            ' ' +
            (o.wanted?.name ?? '') +
            ' ' +
            o.owner +
            ' ' +
            universeName(o.offered.universeId)
          )
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (filter !== 'mine' || o.ownerId === profile?.id) &&
          (listingType === 'all' ||
            (listingType === 'sale' ? o.price !== null : o.price === null)) &&
          (!minPrice || (o.price !== null && o.price >= Number(minPrice))) &&
          (!maxPrice || (o.price !== null && o.price <= Number(maxPrice))) &&
          (finish === 'all' || (o.offered.finish ?? 'standard') === finish) &&
          (filter !== 'available' || canAccept(o)) &&
          (rarity === 'all' || o.offered.rarity === Number(rarity)) &&
          (wantedRarity === 'all' || o.wanted?.rarity === Number(wantedRarity)) &&
          (universe === 'all' || o.offered.universeId === universe) &&
          (!onlyMissing || (!!profile && !(profile.inventory[o.offered.id]?.quantity ?? 0))) &&
          (!onlyDuplicates ||
            (!!profile &&
              !!o.wanted &&
              (profile.inventory[o.wanted.id]?.quantity ?? 0) > 1 &&
              (profile.inventory[o.wanted.id]?.available ?? 0) > 0)),
      )
      .sort((a, b) =>
        sort === 'price-low'
          ? (a.price ?? Infinity) - (b.price ?? Infinity)
          : sort === 'price-high'
            ? (b.price ?? -1) - (a.price ?? -1)
            : sort === 'oldest'
              ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
              : sort === 'rarity-high'
                ? b.offered.rarity - a.offered.rarity
                : sort === 'rarity-low'
                  ? a.offered.rarity - b.offered.rarity
                  : sort === 'name'
                    ? a.offered.name.localeCompare(b.offered.name)
                    : Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
  async function run(path: string, body?: unknown, method?: string) {
    setBusy(true);
    try {
      await api(path, body, method);
      await refresh();
      setError('');
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocaleView>
      <div className="content-page market-page">
        <div className="eyebrow">THE TRADING POST</div>
        <h1>Market</h1>
        <p className="page-description">
          Sell cards for Stellar Prisms or exchange one card for another. Listed copies stay
          reserved until bought, exchanged or cancelled.
        </p>
        <LocalBots />
        <MainChat compact />
        {profile && !profile.registered && (
          <aside className="guest-market-notice menu-window" role="note">
            <div>
              <strong>You’re browsing as a guest</strong>
              <p>
                Register or sign in to post offers and accept exchanges. Registering keeps this
                guest collection and progress.
              </p>
            </div>
            <button className="primary-button" onClick={openAccount}>
              Register or sign in
            </button>
          </aside>
        )}
        <details className="menu-window trade-create">
          <summary>Post an offer</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                '/trades',
                payment === 'sale' ? { offered, price: Number(price) } : { offered, wanted },
              );
            }}
          >
            <div className="lobby-filters">
              <label>
                Offer type
                <select
                  name="page-select-1"
                  aria-label="Offer type"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                >
                  <option value="exchange">Card exchange</option>
                  <option value="sale">Sell for Stellar Prisms</option>
                </select>
              </label>
              <label>
                You offer
                <select
                  name="page-select-2"
                  aria-label="You offer"
                  required
                  value={offered}
                  onChange={(e) => setOffered(e.target.value)}
                >
                  <option value="">Choose an available card</option>
                  {owned.map((c) => (
                    <option key={c.id} value={c.id}>
                      <NoTranslate>{c.name}</NoTranslate>
                      {c.finish === 'holo'
                        ? ` · Holo +1 ${SIDE_NAMES[c.holoBonusSide ?? 0]}`
                        : ''}{' '}
                      · {c.rarity}★
                    </option>
                  ))}
                </select>
              </label>
              {payment === 'exchange' ? (
                <label>
                  You request
                  <select
                    name="page-select-3"
                    aria-label="You request"
                    required
                    value={wanted}
                    onChange={(e) => setWanted(e.target.value)}
                  >
                    <option value="">Choose a card</option>
                    {CARDS.filter((c) => c.id !== offered).map((c) => (
                      <option key={c.id} value={c.id}>
                        <NoTranslate>{c.name}</NoTranslate>
                        {c.finish === 'holo'
                          ? ` · Holo +1 ${SIDE_NAMES[c.holoBonusSide ?? 0]}`
                          : ''}{' '}
                        · {c.rarity}★
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Price in Stellar Prisms
                  <input
                    name="page-input-4"
                    aria-label="Price in Stellar Prisms"
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
              )}
            </div>
            <button className="primary-button" disabled={busy || !profile?.registered}>
              Post offer
            </button>
            {profile && !profile.registered && (
              <p className="eligibility-note">
                An account is required to post an offer. Use “Register or sign in” above.
              </p>
            )}
          </form>
        </details>
        <div className="market-filters">
          <label>
            Listing type
            <select
              name="page-select-5"
              aria-label="Listing type"
              value={listingType}
              onChange={(e) => setListingType(e.target.value)}
            >
              <option value="all">All listings</option>
              <option value="sale">Currency sales</option>
              <option value="exchange">Card exchanges</option>
            </select>
          </label>
          <label>
            Minimum price
            <input
              name="page-input-6"
              aria-label="Minimum price"
              type="number"
              min="1"
              max="1000000"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
          </label>
          <label>
            Maximum price
            <input
              name="page-input-7"
              aria-label="Maximum price"
              type="number"
              min="1"
              max="1000000"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </label>
          <label>
            Find an offer
            <input
              name="page-input-8"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Show
            <select
              name="page-select-9"
              aria-label="Show"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All offers</option>
              <option value="available">Offers I can accept</option>
              <option value="mine">My offers</option>
            </select>
          </label>
          <label>
            Finish
            <select
              name="page-select-10"
              aria-label="Finish"
              value={finish}
              onChange={(e) => setFinish(e.target.value)}
            >
              <option value="all">All finishes</option>
              <option value="standard">Standard</option>
              <option value="holo">Holographic</option>
            </select>
          </label>
          <label>
            Offered rarity
            <select
              name="page-select-11"
              aria-label="Offered rarity"
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
            >
              <option value="all">All rarities</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option value={n} key={n}>
                  {n}★
                </option>
              ))}
            </select>
          </label>
          <label>
            Requested rarity
            <select
              name="page-select-12"
              aria-label="Requested rarity"
              value={wantedRarity}
              onChange={(e) => setWantedRarity(e.target.value)}
            >
              <option value="all">All rarities</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option value={n} key={n}>
                  {n}★
                </option>
              ))}
            </select>
          </label>
          <label>
            Universe
            <select
              name="page-select-13"
              aria-label="Universe"
              value={universe}
              onChange={(e) => setUniverse(e.target.value)}
            >
              <option value="all">All universes</option>
              {UNIVERSES.map((u) => (
                <option value={u.id} key={u.id}>
                  <NoTranslate>{u.name}</NoTranslate>
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select
              name="page-select-14"
              aria-label="Sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="rarity-high">Rarity: high to low</option>
              <option value="rarity-low">Rarity: low to high</option>
              <option value="name">Card name</option>
              <option value="price-low">Price: lowest first</option>
              <option value="price-high">Price: highest first</option>
            </select>
          </label>
        </div>
        <div className="market-collection-filters">
          <label>
            <input
              name="page-input-15"
              type="checkbox"
              checked={onlyMissing}
              disabled={!profile}
              onChange={(e) => setOnlyMissing(e.target.checked)}
            />
            Cards I don’t own
          </label>
          <label>
            <input
              name="page-input-16"
              type="checkbox"
              checked={onlyDuplicates}
              disabled={!profile}
              onChange={(e) => setOnlyDuplicates(e.target.checked)}
            />
            Give only my duplicates
          </label>
          <button
            className="text-button"
            onClick={() => {
              setSearch('');
              setFilter('all');
              setFinish('all');
              setRarity('all');
              setWantedRarity('all');
              setUniverse('all');
              setOnlyMissing(false);
              setOnlyDuplicates(false);
              setSort('newest');
              setListingType('all');
              setMinPrice('');
              setMaxPrice('');
            }}
          >
            Reset filters
          </button>
        </div>
        <p className="market-count" role="status">
          {visible.length} matching offers
        </p>
        <p className="error-message" role="alert">
          {error || connectionError}
        </p>
        <div className="trade-grid">
          {visible.map((o) => (
            <article className="menu-window trade-offer" key={o.id}>
              <h2>
                <Link href={`/profile?id=${o.ownerId}`}>{o.owner}</Link>
              </h2>
              <div className="trade-pair">
                <div>
                  <span>YOU RECEIVE</span>
                  <Card card={o.offered} />
                </div>
                <b aria-hidden="true">⇄</b>
                <div>
                  <span>YOU GIVE</span>
                  {o.wanted ? (
                    <Card card={o.wanted} />
                  ) : (
                    <div className="market-payment">
                      <strong>◇ {o.price}</strong>
                      <span>Stellar Prisms</span>
                    </div>
                  )}
                </div>
              </div>
              {o.ownerId === profile?.id ? (
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => run(`/trades/${o.id}`, undefined, 'DELETE')}
                >
                  Cancel offer
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={busy || !canAccept(o)}
                  aria-describedby={`eligibility-${o.id}`}
                  onClick={() => setSelected(o)}
                >
                  {o.price !== null ? 'Review purchase' : 'Review exchange'}
                </button>
              )}
              {o.ownerId !== profile?.id && !canAccept(o) && (
                <p id={`eligibility-${o.id}`} className="eligibility-note">
                  {!profile?.registered
                    ? 'An account is required to accept trades.'
                    : profile.profiles.some((p) => p.id === o.ownerId)
                      ? 'This offer belongs to one of your profiles.'
                      : o.price !== null
                        ? 'Not enough Stellar Prisms.'
                        : `You need an available copy of ${o.wanted!.name}.`}
                </p>
              )}
            </article>
          ))}
        </div>
        {!visible.length && (
          <p className="empty-search">No offers match. Adjust your filters or post an offer.</p>
        )}
        {selected && (
          <dialog
            ref={confirmRef}
            onCancel={() => setSelected(null)}
            className="trade-confirm menu-window"
            aria-label="Confirm card exchange"
          >
            {selected.price !== null ? (
              <p>
                Pay <strong>{selected.price} Stellar Prisms</strong> to{' '}
                <NoTranslate>{selected.owner}</NoTranslate> and receive{' '}
                <NoTranslate>{selected.offered.name}</NoTranslate>? The purchase is permanent.
              </p>
            ) : (
              <p>
                Give{' '}
                <strong>
                  <NoTranslate>{selected.wanted!.name}</NoTranslate>
                </strong>{' '}
                to <NoTranslate>{selected.owner}</NoTranslate> and receive{' '}
                <strong>
                  <NoTranslate>{selected.offered.name}</NoTranslate>
                </strong>
                ? One copy of each card is permanently transferred.
              </p>
            )}
            <div className="result-actions">
              <button className="outline-button" disabled={busy} onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => run(`/trades/${selected.id}/accept`, {})}
              >
                {selected.price !== null ? 'Confirm purchase' : 'Confirm exchange'}
              </button>
            </div>
          </dialog>
        )}
      </div>
    </LocaleView>
  );
}
