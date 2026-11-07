# Economy — planned for Milestone 5

No balances, packs, rewards, inventory ownership, or currency transactions exist in Milestone 1. Catalog access is unrestricted local test data. Match results do not pretend to award persistent currency.

The design supports **Triad Coins** (gameplay and market currency) and **Card Shards** (bound crafting currency). No premium currency, paid packs, real-money trading, or paid competitive advantage is permitted.

Future wallets and immutable ledgers live on the server in normalized PostgreSQL tables. Purchases, openings, crafting, and reward claims require transactions, ownership checks, idempotency keys, concurrency protection, and audit records. Costs, pack probabilities, shard returns, rewards, and caps belong to versioned configuration. Solo play must provide a sustainable progression path and every standard card must have guaranteed acquisition beyond pack luck.

Eligibility and caps must limit automated farming. Pack openings use server randomness and atomically consume the pack while granting five cards. Arena temporary cards never enter permanent inventory. The complete pack, pity, and crafting requirements remain in the master specification for implementation at the relevant milestone.
