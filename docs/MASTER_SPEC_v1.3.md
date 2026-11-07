# GACHA TRIAD — COMPLETE MASTER CODEX SPECIFICATION v1.3

## 1. Project Overview

You are the lead full-stack developer, software architect, game systems designer, database engineer, and UI/UX designer for **Gacha Triad**.

Your objective is to develop a complete browser-based collectible card game inspired by Triple Triad from Final Fantasy VIII and Final Fantasy XIV.

The game combines:

- The strategic 3×3 board gameplay of Triple Triad.
- Collectible character cards from multiple popular gacha universes.
- Booster packs and free-to-play progression.
- FFXIV-style card rarity and deck restrictions.
- Single-player battles against CPU opponents.
- Real-time online PvP.
- Casual, private, and ranked matchmaking.
- Seasonal competitive ladders.
- An alternative Arena draft mode inspired by Hearthstone Arena.
- A persistent player-driven marketplace.
- Direct card buying, selling, auctions, and trading.
- Card crafting and duplicate management.
- Player accounts with Google, Discord, and email authentication.
- Guest access with the ability to preserve progress upon registration.

The final objective is a polished, persistent, publicly deployable online game.

**This must be a functional application, not a static prototype or mockup.**

### Confirmed Design Decisions

These are fixed requirements:

1. **Card balance:** Higher-rarity cards have stronger values, following FFXIV's rarity philosophy and deck restrictions.
2. **Arena:** Three packs containing fifteen total cards, followed by a five-card draft deck. Each run ends at seven wins or three losses.
3. **Arena MMR:** A separate persistent competitive rating, independent from constructed ranked.
4. **Progression:** Entirely free-to-play. Players earn packs and currencies through gameplay.
5. **Marketplace:** Cards can be bought, sold, auctioned, and traded between players.
6. **Guaranteed acquisition:** Every standard gameplay card must eventually be obtainable without relying exclusively on pack luck.
7. **Authentication:** Guest, email/password, Google, and Discord.
8. **Artwork:** Support character portrait and square-icon artwork, with Prydwen as an initial reference and asset-import source for development.
9. **Platform:** Desktop and mobile web browsers.
10. **Development:** Build incrementally, starting with a complete playable Triple Triad foundation.

Do not introduce paid packs, real-money trading, premium currencies, or pay-to-win systems.

---

## 2. Technical Architecture

Build using a modern, maintainable TypeScript stack.

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Responsive interface
- Lightweight animations
- Accessible controls

### Backend

- Node.js
- Fastify or an equivalent modern framework
- Socket.IO or WebSockets
- Server-authoritative game sessions
- Server-authoritative economy and player inventory

### Database

- PostgreSQL
- Prisma or an equivalent typed ORM
- Schema migrations
- Transactional operations
- Proper database constraints

### Authentication

- Better Auth or a similarly mature solution
- Email/password registration
- Google OAuth
- Discord OAuth
- Anonymous guest sessions
- Secure account linking

### Testing

- Vitest for unit tests
- Integration tests for services
- Playwright for end-to-end testing

### Project Structure

Use a pnpm monorepo.

Suggested structure:

    gacha-triad/
      apps/
        web/
        server/
      packages/
        engine/
        economy/
        database/
        shared/
      data/
        cards/
        universes/
        packs/
        rules/
        assets/
      tools/
        asset-importer/
      docs/
      tests/
      docker-compose.yml
      README.md

The game engine must be completely independent from React and networking.

The project must run locally without paid APIs.

Use environment variables for secrets and external services.

Make the application suitable for future deployment using hosting that supports persistent WebSocket connections.

---

## 3. Gacha Universes and Character Catalog

The initial universes are:

1. Genshin Impact
2. Honkai: Star Rail
3. Zenless Zone Zero
4. Wuthering Waves
5. Arknights: Endfield

The system must support additional universes later without modifying the gameplay engine.

A player may create a deck containing characters from different universes.

Each universe should have:

- Unique ID.
- Display name.
- Character list.
- Card set.
- Artwork references.
- Themed booster packs.
- Collection filters.
- Optional themed PvE challenges.
- Optional special events.

### Character Variants

A character may have multiple forms or versions.

For example, alternate combat forms, costumes, or character releases may eventually become distinct collectible cards.

Use stable identifiers to distinguish variants.

Do not merge different playable forms solely because they share a character's base name.

Keep the card catalog data-driven.

---

## 4. Prydwen Character Artwork and Asset Importer

This is an important component of the project.

We want recognizable character artwork on our Triple Triad cards from the beginning of local development.

Build a dedicated **character asset-import utility**, with Prydwen as an initial reference source.

### 4.1 Prydwen Character Directories

Honkai: Star Rail:
https://www.prydwen.gg/star-rail/characters

Wuthering Waves:
https://www.prydwen.gg/wuthering-waves/characters

Zenless Zone Zero:
https://www.prydwen.gg/zenless/characters

Genshin Impact:
https://www.prydwen.gg/genshin-impact/characters

Arknights: Endfield:
https://www.prydwen.gg/arknights-endfield/characters

### 4.2 Prydwen Tier-List Pages

These pages may contain useful square character icons.

https://www.prydwen.gg/star-rail/tier-list

https://www.prydwen.gg/wuthering-waves/tier-list

https://www.prydwen.gg/zenless/tier-list

https://www.prydwen.gg/genshin-impact/tier-list

https://www.prydwen.gg/arknights-endfield/tier-list

Inspect actual page structures rather than assuming identical image formats between games.

### 4.3 Asset Types

Each character can have several image variants.

**Main Portrait**

Used for:

- Triple Triad cards.
- Pack reveals.
- Collection detail views.
- Marketplace previews.
- Character inspection.

**Square Character Icon**

Used for:

- Compact collection listings.
- Deck previews.
- Market tables.
- Trading interfaces.
- Small UI components.

**Optional Future Variants**

- Alternative art.
- Special editions.
- Seasonal illustrations.
- Animated cards.
- Full-size backgrounds.

The system must gracefully handle missing image variants.

### 4.4 Asset Importer Requirements

Build a standalone Node.js/TypeScript development utility.

It should support:

1. Selecting a supported universe.
2. Discovering publicly visible character entries and available image references.
3. Supporting source-specific parsers for character and tier-list pages.
4. Previewing discovered character images.
5. Selecting individual assets for import.
6. Downloading selected assets when their reuse and the access method are permitted.
7. Matching images to stable character IDs.
8. Generating optimized image sizes using Sharp.
9. Creating portrait and square variants.
10. Preserving original aspect ratios.
11. Allowing manual crop adjustments.
12. Avoiding duplicate downloads.
13. Recording source URLs and provenance.
14. Generating or updating an asset manifest.
15. Reporting missing or failed imports.
16. Supporting future import sources.

Use ordinary HTTP requests or Playwright where appropriate for accessible content.

Do not bypass access restrictions, anti-bot measures, or rate limits, and do not perform prohibited bulk scraping.

Prydwen's terms restrict bulk scraping, and the underlying artwork belongs to its respective rights holders. Keep local development imports separate from assets approved for public distribution.

The initial tool should work with manually supplied files and approved individual image URLs. Its architecture should be expandable to permission-based bulk importing later.

### 4.5 Suggested Importer Commands

Provide convenient commands such as:

- `pnpm assets:inspect`
- `pnpm assets:import`
- `pnpm assets:optimize`
- `pnpm assets:validate`

Allow parameters for:

- Universe.
- Character.
- Asset type.
- Output directory.
- Dry-run mode.
- Overwrite behavior.

Do not require developers to manually edit source code for every imported character.

### 4.6 Asset Storage

Suggested structure:

    public/
      assets/
        characters/
          genshin/
            character-id/
              portrait.webp
              icon.webp
          star-rail/
            character-id/
              portrait.webp
              icon.webp
          zenless/
          wuthering-waves/
          endfield/

Keep file names predictable and based on stable identifiers.

An image asset should include:

- Unique asset ID.
- Character ID.
- Universe ID.
- Asset type.
- Local path.
- Source reference.
- Source URL where available.
- Import date.
- Dimensions.
- Image version.
- Rights-review status.
- Crop settings.

### 4.7 Asset Administration

Eventually provide an admin interface for:

- Importing images.
- Uploading replacements.
- Assigning artwork to characters.
- Adjusting crops.
- Viewing asset metadata.
- Reviewing availability and rights status.
- Previewing card appearance.
- Rebuilding optimized variants.

### 4.8 Card Asset Independence

Artwork must not determine gameplay identity.

Changing artwork must never alter:

- Card ID.
- Card stats.
- Rarity.
- Deck legality.
- Player ownership.
- Market listings.
- Trade offers.
- Match history.
- Arena draft pools.

Use placeholders when illustrations are missing.

The game must remain playable without images.

For public deployment, publish only artwork the project is permitted to use.

---

## 5. Triple Triad Gameplay

Implement authentic Triple Triad mechanics.

### Standard Match

- Two players.
- Five cards per player.
- A 3×3 board containing nine positions.
- Four values on every card: Top, Right, Bottom, Left.
- Values from 1 to 10.
- Display 10 as A.
- Players alternate placing one card per turn.
- Cards cannot be placed on occupied cells.
- Adjacent directional values are compared.
- Under standard rules, a strictly higher attacking value captures the opposing card.
- Captured cards change ownership.
- The game ends when all nine cells are occupied.
- The unplayed tenth card remains counted toward its owner's final score.
- Most owned cards wins.
- Equal ownership results in a draw.

Randomly decide the first player using server-controlled randomness.

### Required Rule Variants

Implement:

1. Standard
2. All Open
3. Three Open
4. Same
5. Plus
6. Combo
7. Same Wall
8. Elemental
9. Reverse
10. Fallen Ace
11. Random
12. Order
13. Chaos
14. Sudden Death
15. Ascension
16. Descension
17. Swap
18. Roulette

Use FFXIV behavior as the primary reference, with FFVIII-specific mechanics where appropriate, particularly Elemental and Same Wall.

### Critical Rule Interactions

Carefully implement and test:

- Same with adjacent friendly and opposing cards.
- Plus with multiple matching sums.
- Same and Plus triggering together.
- Combo chain reactions.
- Same Wall using board boundaries.
- Elemental effective-value changes.
- Reverse and Fallen Ace.
- Ascension and Descension.
- Sudden Death rematches.
- Order and Chaos.
- Hidden cards under Three Open.
- Incompatible rule combinations.

Document rule resolution order explicitly.

For Sudden Death, follow a documented rematch limit to prevent unending matches.

### Rules Engine

Create a deterministic, isolated TypeScript package.

Suggested responsibilities:

- Create game state.
- Validate moves.
- Calculate legal actions.
- Apply card placement.
- Resolve captures.
- Apply special rules.
- Calculate ownership scores.
- Detect match completion.
- Produce match results.

All randomness must be injectable or seeded for reproducible tests.

Avoid coupling rules to animation or network code.

### Rule Presets

Provide configurable rule presets.

Examples:

- Classic: All Open.
- Same Clash: Same + All Open.
- Plus Battle: Plus + All Open.
- Combo Master: Same + Plus.
- Elemental: Elemental + All Open.
- Reverse: Reverse + All Open.
- Chaos: Chaos with compatible rules.
- Custom: User-selected compatible rules.

Validate incompatible combinations.

Ranked formats must be selected by the server.

---

## 6. Card Rarity and Balancing

Card rarity follows an FFXIV-inspired structure.

Rarity ranges from one to five stars.

Higher rarity generally means stronger directional values.

### Deck Restrictions

Every standard deck contains exactly five cards.

Restrictions:

- Maximum one 5-star card.
- Maximum two 4-star cards if there is no 5-star card.
- If a 5-star card is present, maximum one 4-star card.
- Remaining slots contain 1-, 2-, or 3-star cards.
- No duplicate card definition within a deck.

These limits apply to constructed play and Arena by default.

Make the restrictions configurable.

### Card Balance Philosophy

High-rarity cards should be powerful but not automatically win matches.

Create a stat-budget system.

Support different strategic distributions:

- Strong corners.
- Defensive cards.
- Balanced values.
- High directional specialization.
- Same/Plus synergy.
- Element or type-specific interactions.

Do not randomly generate unrestricted values without checking balance.

Create automated tests and analysis tools to help evaluate card strength.

A character's original gacha rarity does not directly determine its Gacha Triad rarity.

Prydwen's tier rankings must not determine Triple Triad stats.

### Card Data

Every card should include:

- Stable ID.
- Character ID.
- Universe ID.
- Name.
- Rarity.
- Four directional stats.
- Optional element.
- Optional type.
- Card set.
- Enabled status.
- Artwork association.

Support future alternate versions without breaking existing collections.

---

## 7. Authentication and Player Accounts

Support four entry options.

### Guest

Players can begin without creating a permanent account.

Guests can:

- Play against CPU.
- Try rule presets.
- Use starter cards.
- Explore collections.
- Build decks.
- Open introductory packs.

Guest progression should persist through server-backed anonymous sessions where practical.

Clearly warn about potentially losing access to unlinked guest progress.

### Email/Password

Support:

- Registration.
- Login.
- Logout.
- Password reset.
- Email verification where appropriate.

### Google OAuth

Provide a working Google login and account-registration flow.

### Discord OAuth

Provide a working Discord login and account-registration flow.

Use Better Auth or an equivalent maintained authentication library.

### Account Linking

One profile may have multiple login providers.

Users should be able to link Google and Discord to the same account.

A guest who registers must keep:

- Owned cards.
- Currency.
- Packs.
- Decks.
- Achievements.
- Progress.
- Relevant match history.

Do not award duplicate starter rewards.

Do not automatically merge existing established accounts based solely on email matching without a secure verification/linking process.

### Competitive Access

Require a registered account for:

- Constructed ranked.
- Arena ranked.
- Public marketplace.
- Player trading.
- Auctions.
- Public leaderboard participation.

Add basic anti-bot and abuse protection.

---

## 8. Collection and Deck Builder

Create a complete persistent collection system.

### Collection Features

- All cards catalog.
- Owned and unowned cards.
- Search.
- Universe filters.
- Rarity filters.
- Duplicate counts.
- Favorites.
- Collection completion percentages.
- Card detail view.
- Wishlist.
- Crafting shortcuts.
- Marketplace price previews.

### Deck Builder

Players can:

- Create multiple decks.
- Name decks.
- Edit decks.
- Delete decks.
- Select a default deck.
- Filter available cards.
- Preview rarity restrictions.
- See invalid deck warnings.

A saved deck references owned card definitions.

Players cannot play a constructed deck containing cards they no longer own.

Market reservations and inventory ownership must be handled correctly.

Active match decks remain immutable after a match begins.

---

## 9. Free-to-Play Economy

Implement two main currencies.

### Triad Coins

The main in-game currency.

Earned through:

- Solo matches.
- Casual PvP.
- Ranked PvP.
- Missions.
- Achievements.
- Arena rewards.
- Seasonal rewards.
- Events.
- Marketplace sales.

Used for:

- Booster packs.
- Fixed-price market purchases.
- Auction bids.
- Buy orders.
- Market fees.
- Selected NPC shop items.

### Card Shards

Account-bound crafting currency.

Earned through:

- Manually recycling duplicates.
- Missions.
- Achievements.
- Arena rewards.
- Progression milestones.

Used for crafting specific cards.

Card Shards cannot be traded or transferred.

### Economy Requirements

- Free-to-play only.
- No premium currency.
- No real-money pack sales.
- No paid competitive advantage.
- Server-side wallets.
- Transactional updates.
- Auditable transaction ledgers.
- Configurable rewards and costs.
- Inflation monitoring.
- Sustainable currency sinks.

Create configurable economy tables rather than hardcoding prices.

A temporary starting economy can be implemented and adjusted during balancing.

Ensure solo players can progress without being forced into competitive modes.

Prevent automated farming through reward eligibility, rate limits, and sensible daily caps.

---

## 10. Booster Packs

Implement collectible booster packs.

Initial pack categories:

- Standard Pack.
- Genshin Impact Pack.
- Honkai: Star Rail Pack.
- Zenless Zone Zero Pack.
- Wuthering Waves Pack.
- Endfield Pack.
- Event Pack.

Each regular pack contains five cards by default.

Pack configuration should include:

- Price.
- Eligible card set.
- Rarity probabilities.
- Guaranteed slots.
- Availability.
- Art and presentation.
- Version identifier.

### Pack Opening

Implement an animated pack-opening interface.

Flow:

1. Select pack.
2. Open pack.
3. Reveal generated cards.
4. Highlight high-rarity cards.
5. Mark newly collected cards.
6. Identify duplicates.
7. Display results summary.
8. Return to collection or open another pack.

Support skipping animations.

All rewards must be generated by the server.

Opening must be transactional and idempotent.

Show probabilities transparently.

Duplicates remain available for selling, trading, or recycling.

Do not automatically destroy duplicates.

---

## 11. Card Crafting and Guaranteed Collection

A player should eventually be able to obtain any standard gameplay card without relying entirely on random drops.

Implement direct crafting.

### Crafting Flow

1. Select a card from the collection catalog.
2. Display its Card Shard cost.
3. Check the player's available shards.
4. Confirm crafting.
5. Deduct shards on the server.
6. Add the card to inventory.
7. Record the transaction.

Higher-rarity cards cost more shards.

All crafting costs should be configurable.

Standard playable versions must remain craftable.

Limited cosmetic variations can have different acquisition conditions, provided they do not create gameplay-exclusive power unavailable through standard cards.

### Card Acquisition Paths

Cards can be obtained through:

- Opening packs.
- Buying from other players.
- Trading.
- Completing gameplay objectives.
- Crafting.

This is essential to the long-term collection experience.

---

## 12. Player Marketplace

Build a player-driven economy inspired by collectible-game markets such as:

https://kyara.games/marche

The marketplace should be an important part of the website.

Support:

1. Fixed-price listings.
2. Direct purchases.
3. Buy orders.
4. Auctions.
5. Direct player trades.
6. Public trade offers.
7. Wishlists.
8. Price history.
9. Transaction history.

All transactions use in-game assets and currencies.

No real-money trading.

### 12.1 Fixed-Price Sales

Players can list tradable cards for Triad Coins.

Each listing contains:

- Card ID.
- Seller ID.
- Quantity.
- Price per card.
- Creation time.
- Expiration.
- Status.

When purchased:

- Validate the listing.
- Verify available funds.
- Reserve/lock inventory as necessary.
- Transfer currency.
- Transfer card ownership.
- Apply market fees.
- Update the listing.
- Record the transaction.

All steps must be atomic.

### 12.2 Buy Orders

Players may create requests to buy specific cards.

Each buy order contains:

- Desired card.
- Maximum offered price.
- Quantity.
- Buyer.
- Expiration.

Reserve the required funds while the order is active.

Other players may fulfill the order.

Return unused reserved currency upon cancellation or expiration.

Support automatic order matching later if practical.

### 12.3 Auctions

Players can auction tradable cards.

Auction configuration:

- Starting bid.
- Minimum bid increment.
- Optional buyout.
- Start time.
- End time.
- Seller.
- Leading bidder.
- Bid history.

Bids require available coins.

Reserve the highest bidder's funds.

Release previous bids when outbid.

Implement configurable anti-sniping extensions.

Settle completed auctions automatically and idempotently.

Return unsold cards to the seller.

Prevent invalid cancellations after valid bids.

### 12.4 Direct Trading

Players may exchange cards directly.

Support:

- Card-for-card.
- Multiple cards per side.
- Optional coin compensation.
- Trade invitations.
- Public trade offers.
- Counteroffers.

Both players must confirm the final proposed transaction.

Any change invalidates previous confirmations.

All assets must be transferred atomically.

Never permit partial completion.

### 12.5 Public Trade Board

Allow players to post offers such as:

- Offering specific cards.
- Looking for specific cards.
- Accepting alternatives.
- Offering or requesting coins alongside cards.

Provide searching and filtering.

### 12.6 Marketplace Interface

Sections:

- Browse Market.
- Buy Cards.
- Sell Cards.
- Auctions.
- Buy Orders.
- Trade Market.
- My Listings.
- My Transactions.
- Watchlist.

Filters:

- Universe.
- Character.
- Rarity.
- Price.
- Listing type.
- Owned/unowned.

Show:

- Lowest current listing.
- Available quantity.
- Recent completed sales.
- Historical prices.
- Average or median sale prices when meaningful.

### 12.7 Market Fees

Use configurable transaction fees to remove currency from the economy.

A 5% sale tax can serve as an initial testing value.

Do not hardcode permanent economy decisions.

### 12.8 Notifications

Notify players when:

- A card sells.
- They are outbid.
- An auction ends.
- A buy order is filled.
- A trade request arrives.
- A trade is accepted.
- A listing expires.

Use in-app notifications and optional real-time updates.

---

## 13. Marketplace Security

The marketplace must be designed for safety and transactional integrity.

### Required Safeguards

- Server-authoritative inventory.
- Server-authoritative currency balances.
- Escrow or reservations.
- Database transactions.
- Idempotency keys.
- Concurrency protection.
- Ownership validation.
- Input validation.
- Rate limiting.
- Audit logs.

Prevent:

- Selling the same card twice.
- Buying already sold listings.
- Duplicate item creation.
- Double-spending currency.
- Auction settlement duplication.
- Replay attacks.
- Unauthorized transactions.
- Self-trading exploits.
- Wash trading.
- Reward-farming through coordinated accounts.

Provide configurable market eligibility requirements.

Starter cards and certain promotional rewards may be account-bound.

Ordinary pack cards should generally be tradable.

Crafted cards may be bound if required for economic balance.

Document these policies clearly.

---

## 14. Solo Mode and CPU AI

Implement genuine CPU opponents.

### Easy

- Mostly random legal moves.
- Basic captures.
- Beginner-friendly.

### Normal

- Evaluates immediate captures.
- Avoids obvious weaknesses.
- Uses simple positioning.
- Recognizes Same and Plus opportunities.

### Hard

- Uses bounded lookahead, minimax, alpha-beta pruning, or another suitable strategy.
- Evaluates board control.
- Understands remaining cards.
- Considers counter-captures.
- Understands active special rules.

The AI must not inspect hidden information unavailable to a human opponent.

### Solo Features

- Quick Match.
- Difficulty selector.
- Rule preset selector.
- Rematch.
- Match rewards.
- Progression objectives.

Future additions:

- Universe-themed CPU opponents.
- Character-themed challenges.
- Daily challenges.
- Solo tournaments.

---

## 15. Real-Time Online Multiplayer

Create fully functional server-authoritative online matches.

Modes:

- Casual Matchmaking.
- Ranked Matchmaking.
- Private Matches.
- Arena Matchmaking.

### Requirements

- WebSocket communication.
- Server-controlled turns.
- Validated moves.
- Synchronized board state.
- Capture animations.
- Match timers.
- Reconnection.
- Disconnection handling.
- Hidden-card protection.
- Match persistence.
- Match history.
- Validated results.
- Server-side reward processing.

Never trust client-reported victories or scores.

Private matches use configurable rule presets and must not modify ranked ratings.

---

## 16. Constructed Ranked Ladder

Create a seasonal competitive system.

### Ranking

Use Elo, Glicko-2, or another documented MMR approach.

Suggested visible tiers:

- Bronze.
- Silver.
- Gold.
- Platinum.
- Diamond.
- Master.
- Grandmaster.

Implement:

- Constructed MMR.
- Rating-based matchmaking.
- Seasonal leaderboard.
- Win/loss/draw statistics.
- Match history.
- Seasonal rewards.
- Soft resets.
- Rank progression.

### Ranked Rules

Use rotating competitive formats.

Examples:

- All Open.
- Same + All Open.
- Plus + All Open.
- Elemental + All Open.
- Reverse + All Open.

The active ranked rules must be clearly visible before queueing.

Players cannot change rules after matchmaking begins.

---

## 17. Arena — Separate Competitive Draft Mode

Arena is inspired by Hearthstone Arena.

It is different from the single-match Draft rule in FFXIV.

### Arena Flow

**Step 1 — Start Run**

Player enters Arena.

The initial implementation has no entry fee.

**Step 2 — Receive Three Packs**

The player receives exactly three temporary Arena packs.

Each pack contains five cards.

The total draft pool contains fifteen cards.

**Step 3 — Open Packs**

Show the normal pack-opening interface.

Arena cards are added to the run's temporary inventory.

They do not enter the permanent collection.

**Step 4 — Build Deck**

Select exactly five cards from the fifteen-card pool.

Apply the normal FFXIV-style rarity restrictions.

The generated pool must guarantee at least one legal deck.

**Step 5 — Play Matches**

Queue against other Arena players.

The run ends at:

- Seven victories.
- Three defeats.

Whichever happens first.

Draws are recorded separately without consuming a win or loss.

**Step 6 — Claim Rewards**

Display:

- Wins.
- Losses.
- Run statistics.
- Arena rating changes.
- Rewards.

### Arena Matchmaking

Use:

- Independent Arena MMR.
- Current run performance.
- Available queue population.

Do not use constructed MMR for Arena matchmaking.

Do not secretly replace real opponents with CPU opponents in rated Arena.

### Arena Persistence

Players can leave and return to their current run.

Persist:

- Drafted cards.
- Selected deck.
- Wins.
- Losses.
- Match history.
- Run status.

Prevent repeatedly abandoning poor drafts for free rerolls.

### Arena Rewards

Scale rewards based on run performance.

Possible rewards:

- Triad Coins.
- Regular booster packs.
- Card Shards.
- Seasonal achievements.
- Cosmetic rewards.

Balance rewards to discourage automated farming.

### Arena Leaderboard

Create a completely separate leaderboard.

Constructed ranked and Arena use independent MMR systems.

---

## 18. Progression, Missions, and Achievements

Provide sustainable free-to-play progression.

Possible rewards:

- Daily missions.
- Weekly missions.
- First-win bonuses.
- Solo match milestones.
- PvP objectives.
- Arena milestones.
- Collection achievements.
- Special event missions.
- Seasonal progression.

Use server-side reward validation.

Ensure that new players can earn currency and cards without requiring purchases or ranked participation.

Do not make daily login streaks mandatory for competitive viability.

---

## 19. Website Pages and UI/UX

Build an attractive, responsive card-game website.

The visual direction should combine dark fantasy and sci-fi elements with a cohesive multi-universe collectible-game aesthetic.

Use original branding and interface designs.

### Home

- Logo.
- Play Now.
- Current rank.
- Currency balances.
- Current Arena run.
- Daily missions.
- Collection progress.
- Recent updates.

### Play

- Solo.
- Casual PvP.
- Ranked PvP.
- Private Match.
- Arena.

### Game Board

- Large 3×3 board.
- Five-card hands.
- Readable directional values.
- Card artwork.
- Player ownership colors.
- Capture animations.
- Active rules.
- Turn timer.
- Current score.
- Match results.

### Collection

- Character gallery.
- Artwork previews.
- Filters.
- Search.
- Rarity.
- Duplicate count.
- Completion tracking.
- Crafting shortcuts.

### Deck Builder

- Available cards.
- Saved decks.
- Five-card composition.
- Rarity validation.
- Deck naming.
- Card details.

### Packs

- Pack shop.
- Owned packs.
- Pack opening.
- Reward reveal.
- Pack probabilities.

### Marketplace

- Card listings.
- Auctions.
- Trading.
- Buy orders.
- Watchlists.
- Price history.
- Personal listings.

### Rankings

- Constructed ladder.
- Arena ladder.
- Seasons.
- Player statistics.

### Profile

- Username.
- Avatar.
- Collection completion.
- Match history.
- Ranks.
- Achievements.
- Account linking.

### Rules and Tutorial

- Basic rules.
- Card values.
- Captures.
- Same.
- Plus.
- Combo.
- Advanced rules.
- Deck restrictions.
- Arena rules.
- Marketplace guidance.

Provide interactive explanations where practical.

### Admin

- Card management.
- Artwork management.
- Pack configuration.
- Economy settings.
- Rule rotations.
- Marketplace management.
- User and transaction review.

Protect all admin actions with server-side authorization.

---

## 20. Database Requirements

Create normalized database entities for:

### Authentication

- Users.
- Authentication accounts.
- Sessions.
- Player profiles.

### Card Catalog

- Universes.
- Characters.
- Card definitions.
- Card variants.
- Card sets.
- Character assets.
- Asset provenance.

### Inventory

- Owned cards.
- Inventory reservations.
- Decks.
- Favorites.
- Wishlists.

### Economy

- Wallets.
- Currency transactions.
- Pack definitions.
- Pack inventory.
- Pack openings.
- Crafting transactions.
- Reward claims.

### Marketplace

- Listings.
- Purchases.
- Buy orders.
- Auctions.
- Auction bids.
- Trade offers.
- Trade participants.
- Escrow reservations.
- Market transactions.
- Notifications.
- Price history.

### Gameplay

- Matches.
- Participants.
- Moves.
- Results.
- Rule presets.
- Ranked seasons.
- Player ratings.

### Arena

- Arena runs.
- Draft pools.
- Arena decks.
- Run matches.
- Arena rating history.
- Arena rewards.

### Progression

- Missions.
- Mission progress.
- Achievements.
- Reward tables.

Use proper foreign keys, constraints, indexes, migrations, and transactional services.

Avoid storing critical economic state exclusively in flexible JSON fields.

---

## 21. Testing and Anti-Cheat

Implement tests throughout development.

### Game Engine

- Standard captures.
- Same.
- Plus.
- Combo.
- Same Wall.
- Elemental.
- Reverse.
- Fallen Ace.
- Other supported rules.
- Rule interactions.
- Legal moves.
- Invalid moves.
- Draws.
- Game completion.
- Deterministic seeded state.

### Authentication

- Guest account creation.
- Guest conversion.
- Google OAuth integration with mocked callbacks.
- Discord OAuth integration with mocked callbacks.
- Provider linking.
- Duplicate starter reward prevention.

### Economy

- Pack purchases.
- Pack opening.
- Duplicate handling.
- Currency transactions.
- Crafting.
- Reward claims.
- Concurrent operations.

### Marketplace

- Listing creation.
- Listing purchase.
- Simultaneous purchase attempts.
- Auction bidding.
- Outbid refunds.
- Auction settlement.
- Trade completion.
- Buy-order fulfillment.
- Currency escrow.
- Inventory reservations.
- Transaction rollback.

### Multiplayer

- Move validation.
- Turn ownership.
- Reconnection.
- Hidden information.
- Result persistence.
- Rating updates.

### Arena

- Draft generation.
- Guaranteed legal decks.
- Run persistence.
- Seven-win termination.
- Three-loss termination.
- Reward settlement.
- Separate MMR.

### End-to-End

Use Playwright to verify real user journeys.

Do not mark a feature as complete just because its interface renders.

---

## 22. Development Roadmap

Follow this order.

### Milestone 1 — Playable Triple Triad Foundation

**IMPLEMENT THIS FIRST.**

Deliver:

- Working Next.js website.
- Project structure.
- Shared TypeScript game engine.
- Functional 3×3 board.
- Five-card hands.
- Standard captures.
- All Open.
- Same.
- Plus.
- Combo.
- Game scoring.
- Victory/defeat/draw screens.
- Basic CPU opponent.
- Test card catalog.
- Card frames.
- Artwork placeholders.
- Basic rules screen.
- Automated engine tests.

Acceptance criteria:

A player can open the website locally, select a CPU opponent, complete a Triple Triad match, and receive a correct result.

Do not proceed until the game is genuinely playable.

### Milestone 2 — Advanced Rules and Card System

- Remaining advanced rules.
- Rule compatibility.
- Rule presets.
- Card rarity.
- FFXIV deck restrictions.
- Card stat balancing.
- Complete rules documentation.

### Milestone 3 — Character Assets and Importer

- Character asset manifest.
- Asset import utility.
- Prydwen source adapters for permitted selected imports.
- Portrait support.
- Square-icon support.
- Image optimization.
- Character-to-image matching.
- Crop controls.
- Placeholder fallbacks.
- Card artwork presentation.

The importer must not block progress on core gameplay if a third-party source becomes unavailable.

### Milestone 4 — Authentication and Collection

- PostgreSQL persistence.
- Guest sessions.
- Email registration.
- Google OAuth.
- Discord OAuth.
- Account linking.
- Collection system.
- Persistent inventory.
- Starter cards.
- Saved decks.
- Player profiles.

### Milestone 5 — Currency and Packs

- Triad Coins.
- Card Shards.
- Wallet ledger.
- Pack shop.
- Pack probabilities.
- Pack-opening logic.
- Opening animations.
- Duplicate management.
- Card crafting.
- Basic free-to-play rewards.

### Milestone 6 — Marketplace Foundation

- Market browsing.
- Fixed-price listings.
- Buying and selling.
- Inventory reservations.
- Transaction fees.
- Transaction history.
- Concurrent purchase protection.

### Milestone 7 — Online Multiplayer

- WebSocket server.
- Server-authoritative matches.
- Casual matchmaking.
- Private rooms.
- Reconnection.
- Match persistence.
- Match rewards.

### Milestone 8 — Constructed Ranked

- MMR.
- Ranked queue.
- Seasonal tiers.
- Leaderboards.
- Rule rotation.
- Competitive statistics.

### Milestone 9 — Arena

- Three-pack drafts.
- Fifteen-card pools.
- Five-card decks.
- Seven wins / three losses.
- Arena matchmaking.
- Arena rewards.
- Independent Arena MMR.
- Arena leaderboard.

### Milestone 10 — Advanced Marketplace

- Auctions.
- Bidding.
- Anti-sniping protection.
- Buy orders.
- Direct player trades.
- Public trade board.
- Counteroffers.
- Notifications.
- Price history.
- Advanced market protections.

### Milestone 11 — Final Polish and Deployment

- Responsive design improvements.
- Animation polish.
- Performance optimization.
- Security review.
- Economy monitoring.
- Administration tools.
- Accessibility improvements.
- Complete documentation.
- Production deployment.
- End-to-end validation.

Keep every completed milestone runnable.

---

## 23. Documentation

Maintain the following files:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/GAME_RULES.md`
- `docs/CARD_BALANCE.md`
- `docs/CARD_CATALOG.md`
- `docs/ASSET_IMPORTER.md`
- `docs/AUTHENTICATION.md`
- `docs/ECONOMY.md`
- `docs/MARKETPLACE.md`
- `docs/ARENA.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`

Update the documentation as implementation progresses.

Record major design decisions and unresolved limitations.

---

## 24. Reference Resources

### Triple Triad

FFXIV Official Guide:
https://na.finalfantasyxiv.com/lodestone/playguide/contentsguide/goldsaucer/tripletriad/

FFVIII Triple Triad:
https://finalfantasy.fandom.com/wiki/Triple_Triad_(Final_Fantasy_VIII)

ARR Triple Triad:
https://arrtripletriad.com/en/how-to-play

HTML5 Example:
https://github.com/itdelatrisu/triple-triad-html5

Browser Examples:
https://triple-triad.jamiepates.com/
https://triple-triad.vercel.app/game

### Marketplace Inspiration

https://kyara.games/marche

### Character and Artwork References

https://www.prydwen.gg/star-rail/characters
https://www.prydwen.gg/wuthering-waves/characters
https://www.prydwen.gg/zenless/characters
https://www.prydwen.gg/genshin-impact/characters
https://www.prydwen.gg/arknights-endfield/characters

Corresponding `/tier-list` pages can help identify square portrait formats.

### Authentication

https://www.better-auth.com/docs

Study available references to understand mechanics and workflows.

Do not blindly copy copyrighted assets, proprietary site content, or incompatible third-party code.

If reference material cannot be accessed, record the limitation rather than inventing details.

---

## 25. Immediate Codex Instructions

**BEGIN IMPLEMENTING MILESTONE 1 NOW.**

Do not attempt to build every feature simultaneously.

First inspect the existing repository.

If it is empty, initialize the project.

Then:

1. Set up the TypeScript monorepo.
2. Create the Next.js frontend.
3. Implement the deterministic Triple Triad engine.
4. Add legal move validation and capture logic.
5. Implement Standard, All Open, Same, Plus, and Combo.
6. Create enough test cards for complete matches.
7. Build the real interactive 3×3 board.
8. Build readable card frames with directional values.
9. Implement at least Easy and Normal CPU opponents.
10. Implement scoring and match results.
11. Add a basic rules/tutorial page.
12. Write and run engine tests.
13. Launch the application and verify the complete gameplay flow.
14. Fix discovered errors before marking the milestone complete.

Do not stop after writing architecture documentation or generating the folder structure.

Do not implement fake multiplayer or a fake economy merely to show unfinished UI elements.

Use placeholders or locally supplied approved artwork until the asset importer is implemented.

Keep all major future systems accounted for in the architecture, without prematurely building them.

### Completion Report

Once the first playable milestone is complete, report:

- What is implemented and genuinely working.
- Commands to run the project.
- What tests were executed.
- Known bugs or limitations.
- Important decisions made.
- The recommended next milestone.

### Long-Term Vision

Gacha Triad should become a complete free-to-play collectible Triple Triad platform.

Players should be able to:

- Play casually or competitively.
- Collect characters from their favorite gacha universes.
- Open packs.
- Build strategic decks.
- Progress through competitive rankings.
- Draft and compete in Arena.
- Buy, sell, auction, and trade cards.
- Craft specific missing characters.
- Eventually complete the standard gameplay collection without depending entirely on luck.

The game should remain accessible to new players while offering meaningful depth to competitive and collection-focused players.

**Start development immediately with Milestone 1: a fully playable Triple Triad game against the CPU.**
