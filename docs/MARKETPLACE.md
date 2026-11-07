# Marketplace and card exchange

## Implemented local v0.3

`/market` is a **card-for-card exchange**, rather than a currency market. Registered players post one owned available copy and request a different card. Up to five offers can remain open per profile. The offered copy is reserved until cancellation or acceptance. Acceptance checks separate accounts and available requested inventory, then debits and credits both profiles, records four ledger entries and closes the offer in one transaction. Concurrent acceptance and replays can settle an offer only once. Exchanges include a confirmation dialog and are permanent. Deck eligibility updates with inventory; Auto build repairs decks whose cards have been traded away.

Clearly labeled local bots post offers and accept player offers they can fulfil. Pausing the population cancels bot-owned open offers and releases their reserved copies; completed exchanges remain in the save. No fake currencies or price history are displayed. Collector achievement unlocks are checked after inventory transfer.

## Earlier currency marketplace plan — not implemented

There is no market UI, transaction service, or fictitious price history in Milestone 1.

Milestone 6 implements fixed-price listings with inventory reservations, server-validated eligibility, configurable fees, auditable purchase history, and transactional ownership transfer. Two buyers racing for one card must produce exactly one successful sale. Selling a card must update subsequent deck eligibility; active match snapshots remain immutable.

Milestone 10 extends the same reservation and ledger model to auctions, anti-sniping, buy orders, trades/counteroffers, and notifications. Settlement must be idempotent. Bids reserve currency, outbid funds return correctly, and failures roll back all state. Listings and offers cannot reuse escrowed items. Self-trading, replay attempts, and coordinated reward abuse need explicit server checks.

Starter/promotional cards may be bound; normal pack cards generally trade. Crafted-card binding policy must be decided alongside balancing before a live marketplace. Never rely on browser-submitted balances or card ownership.
