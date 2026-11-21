'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ALL_CARDS, SIDE_NAMES } from '@gacha-triad/shared';
import {
  BOOSTER_TYPES,
  ECONOMY,
  type MarketRequestView,
  type TradeOfferView,
} from '@gacha-triad/shared/platform';
import { api } from '../lib/platform';
import { publishSiteUpdate, useSiteRevision } from '../lib/site-updates';
import { useSession } from './session';
import { useWishlist } from './use-wishlist';
import { useActionNotice } from './action-notice';
import { Card } from './card';
import { LocaleView, NoTranslate } from './i18n';
import { GameDialog } from './ui';

const cards = new Map(ALL_CARDS.map((card) => [card.id, card]));
const pageSize = 24;
const boosterSources = (card: (typeof ALL_CARDS)[number]) =>
  card.enabled
    ? BOOSTER_TYPES.filter(
        (booster) =>
          (booster.universes as readonly string[]).includes(card.universeId) &&
          (booster.id !== 'starter' || !!ECONOMY.starterWeights[card.rarity - 1]),
      )
    : [];
type MarketDialog =
  { kind: 'respond'; request: MarketRequestView } | { kind: 'buy'; offer: TradeOfferView };

export function MarketCollections({
  tab,
  onViewListings,
}: {
  tab: 'wishlist' | 'requests';
  onViewListings: (cardId: string) => void;
}) {
  const { profile, revision, refreshProfile, openAccount } = useSession();
  const marketRevision = useSiteRevision('market');
  const [pulse, setPulse] = useState(0);
  const wishlist = useWishlist(
    tab === 'wishlist' ? profile?.id : undefined,
    revision + pulse + marketRevision,
  );
  const [requests, setRequests] = useState<{ owner: string; rows: MarketRequestView[] } | null>(
    null,
  );
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [dialog, setDialog] = useState<MarketDialog | null>(null);
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const toast = useActionNotice();
  const owner = profile?.id;
  useEffect(() => {
    if (tab !== 'requests' || !owner) return;
    let current = true;
    void api<MarketRequestView[]>('/market/requests').then(
      (rows) => {
        if (current) {
          setRequests({ owner, rows });
          setLoadError('');
        }
      },
      (e: Error) => {
        if (current) setLoadError(e.message);
      },
    );
    return () => {
      current = false;
    };
  }, [owner, tab, revision, pulse, marketRevision]);
  useEffect(() => {
    setQuery('');
    setPage(0);
    setError('');
  }, [tab]);
  async function run(path: string, body: unknown, message: string, method?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api(path, body, method);
      setDialog(null);
      publishSiteUpdate('market');
      toast(message);
      if (
        path !== '/market/requests' &&
        !(method === 'DELETE' && path.startsWith('/market/requests/'))
      )
        await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
      setPulse((value) => value + 1);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const rows = requests?.owner === owner ? requests?.rows : null;
  const visibleWish = wishlist.rows?.filter((entry) =>
    cards.get(entry.cardId)?.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const visibleRequests = rows?.filter(
    (request) =>
      cards
        .get(request.cardId)
        ?.name.toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) &&
      (!availableOnly ||
        (request.requesterId !== owner && !!profile?.inventory[request.cardId]?.available)),
  );
  const visibleCount = (tab === 'wishlist' ? visibleWish : visibleRequests)?.length ?? 0;
  const pages = Math.max(1, Math.ceil(visibleCount / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const start = currentPage * pageSize;
  const dialogCard =
    dialog?.kind === 'respond' ? cards.get(dialog.request.cardId) : dialog?.offer.offered;
  const dialogTitle = dialog?.kind === 'buy' ? 'Review purchase' : 'Respond to request';
  return (
    <LocaleView>
      <div className="collection-market-panel">
        <div className="collection-market-tools">
          <label>
            Find a card
            <input
              name="marketCollectionQuery"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
          {tab === 'wishlist' ? (
            <Link className="outline-button" href="/cards">
              Browse cards
            </Link>
          ) : (
            <label className="check-label">
              <input
                name="canRespond"
                type="checkbox"
                checked={availableOnly}
                onChange={(event) => {
                  setAvailableOnly(event.target.checked);
                  setPage(0);
                }}
              />
              Cards I can offer
            </label>
          )}
        </div>
        {((!dialog && error) || (tab === 'wishlist' ? wishlist.error : loadError)) && (
          <p className="error-message" role="alert">
            {(!dialog && error) || (tab === 'wishlist' ? wishlist.error : loadError)}
          </p>
        )}
        {tab === 'wishlist' && (
          <>
            {!wishlist.rows && !wishlist.error && <p role="status">Loading wishlist…</p>}
            {visibleWish?.length === 0 && (
              <p>
                {query ? 'No cards match this search.' : 'Star cards in Cards to save them here.'}
              </p>
            )}
            <div className="collection-market-grid">
              {visibleWish?.slice(start, start + pageSize).map((entry) => {
                const card = cards.get(entry.cardId);
                if (!card) return null;
                const boosters = boosterSources(card);
                return (
                  <article className="menu-window collection-market-card" key={card.id}>
                    <div className="collection-market-art">
                      <Card card={card} />
                    </div>
                    <div className="collection-market-details">
                      <h2>
                        <NoTranslate>{card.name}</NoTranslate>
                      </h2>
                      {card.holoBonusSide !== undefined && (
                        <small>{`Holo · +1 ${SIDE_NAMES[card.holoBonusSide]}`}</small>
                      )}
                      <small>
                        {(profile?.inventory[card.id]?.quantity ?? 0) > 0 ? 'Owned' : 'Not owned'}
                      </small>
                      {boosters.length > 0 && (
                        <small>
                          {boosters.map((booster, index) => (
                            <span key={booster.id}>
                              {index > 0 && ' · '}
                              {booster.name}
                            </span>
                          ))}
                        </small>
                      )}
                      {card.finish !== 'holo' && card.enabled && (
                        <small>Card shop · ◇ {ECONOMY.cardPrices[card.rarity - 1]}</small>
                      )}
                      <div className="collection-market-actions">
                        {entry.listings > 0 && (
                          <button
                            className="outline-button"
                            onClick={() => onViewListings(card.id)}
                          >{`View listings (${entry.listings})`}</button>
                        )}
                        {entry.requestId ? (
                          <span>Request open</span>
                        ) : (
                          <button
                            className="outline-button"
                            disabled={busy || !!wishlist.pending}
                            onClick={() => {
                              if (!profile?.registered) return openAccount();
                              void run('/market/requests', { cardId: card.id }, 'Request posted.');
                            }}
                          >
                            {profile?.registered ? 'Post request' : 'Register to post requests'}
                          </button>
                        )}
                        <button
                          className="text-button"
                          disabled={busy || !!wishlist.pending}
                          onClick={() => void wishlist.save(card.id, false)}
                        >
                          Remove from wishlist
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
        {tab === 'requests' && (
          <>
            {!rows && !loadError && <p role="status">Loading market requests…</p>}
            {visibleRequests?.length === 0 && (
              <p>
                {query || availableOnly
                  ? 'No requests match these filters.'
                  : 'No open requests. Post one from your wishlist.'}
              </p>
            )}
            <div className="collection-market-grid">
              {visibleRequests?.slice(start, start + pageSize).map((request) => {
                const card = cards.get(request.cardId);
                if (!card) return null;
                const mine = request.requesterId === owner;
                const existing = request.responses.find(({ ownerId }) => ownerId === owner);
                const compatible =
                  !!profile?.registered &&
                  !profile.profiles.some(({ id }) => id === request.requesterId) &&
                  !!profile.inventory[request.cardId]?.available;
                return (
                  <article className="menu-window collection-market-card" key={request.id}>
                    <div className="collection-market-art">
                      <Card card={card} />
                    </div>
                    <div className="collection-market-details">
                      <h2>
                        <NoTranslate>{card.name}</NoTranslate>
                      </h2>
                      {card.holoBonusSide !== undefined && (
                        <small>{`Holo · +1 ${SIDE_NAMES[card.holoBonusSide]}`}</small>
                      )}
                      <small>
                        <NoTranslate>{request.requester}</NoTranslate>
                      </small>
                      {mine ? (
                        <>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                `/market/requests/${request.id}`,
                                undefined,
                                'Request cancelled.',
                                'DELETE',
                              )
                            }
                          >
                            Cancel request
                          </button>
                          {!request.responses.length && <small>Waiting for offers</small>}
                        </>
                      ) : existing ? (
                        <div className="collection-market-actions">
                          <span>◇ {existing.price}</span>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                `/trades/${existing.id}`,
                                undefined,
                                'Offer cancelled.',
                                'DELETE',
                              )
                            }
                          >
                            Cancel response
                          </button>
                        </div>
                      ) : (
                        <button
                          className="outline-button"
                          disabled={busy || !compatible}
                          onClick={() => {
                            setPrice('');
                            setError('');
                            setDialog({ kind: 'respond', request });
                          }}
                        >
                          Respond to request
                        </button>
                      )}
                    </div>
                    {mine && request.responses.length > 0 && (
                      <ul className="market-response-list menu-scrollbar">
                        {request.responses.map((offer) => (
                          <li key={offer.id}>
                            <strong>
                              <NoTranslate>{offer.owner}</NoTranslate>
                            </strong>
                            <span>◇ {offer.price}</span>
                            <button
                              className="outline-button"
                              disabled={busy || (profile?.prisms ?? 0) < (offer.price ?? 0)}
                              onClick={() => {
                                setError('');
                                setDialog({ kind: 'buy', offer });
                              }}
                            >
                              Review purchase
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
        {pages > 1 && (
          <div className="library-paging">
            <button
              className="outline-button"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              ← Previous
            </button>
            <span>
              {currentPage + 1}/{pages}
            </span>
            <button
              className="outline-button"
              disabled={currentPage + 1 >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
      <GameDialog
        open={!!dialog}
        onClose={() => {
          setDialog(null);
          setError('');
        }}
        labelledBy="market-request-dialog-title"
        className="market-request-dialog"
        dismissible={!busy}
      >
        <h2 id="market-request-dialog-title">{dialogTitle}</h2>
        {dialogCard && (
          <p>
            <NoTranslate>{dialogCard.name}</NoTranslate>
            {dialogCard.holoBonusSide !== undefined &&
              ` · Holo +1 ${SIDE_NAMES[dialogCard.holoBonusSide]}`}
          </p>
        )}
        {dialog?.kind === 'respond' && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                `/market/requests/${dialog.request.id}/respond`,
                { price: Number(price) },
                'Offer sent.',
              );
            }}
          >
            <label>
              Price in Stellar Prisms
              <input
                name="requestPrice"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                type="number"
                min={1}
                max={1000000}
                step={1}
                required
              />
            </label>
            <small>This copy stays reserved while the offer is open.</small>
            <button className="primary-button" disabled={busy}>
              Send offer
            </button>
          </form>
        )}
        {dialog?.kind === 'buy' && (
          <div className="market-request-purchase">
            <p>
              ◇ {dialog.offer.price} Stellar Prisms ·{' '}
              <NoTranslate>{dialog.offer.owner}</NoTranslate>
            </p>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void run(`/trades/${dialog.offer.id}/accept`, {}, 'Purchase complete.')
              }
            >
              Confirm purchase
            </button>
          </div>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </GameDialog>
    </LocaleView>
  );
}
