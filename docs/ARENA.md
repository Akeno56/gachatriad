# Draft — current implementation

The user replaced the former Arena plan with Draft. The previous three packs, fifteen-card pool and seven-win/three-loss run design is superseded.

The [official FFXIV guide](https://na.finalfantasyxiv.com/lodestone/playguide/contentsguide/goldsaucer/tripletriad/) describes selecting five cards from a random offering without using owned cards. Our local implementation offers **eight** cards: one 5★, one 4★ and six lower-rarity cards, shuffled separately for each player. Eight is a Gacha Triad design choice, not a claimed FFXIV pool size.

Choose five distinct cards within the normal rarity limit in three minutes. Players see only their own pool. Locking is final. When both hands lock, a single Three Open match begins, with no card trade. At timeout the server fills unlocked hands with legal random choices. The pool never enters owned inventory and no entry fee or reward currency is invented. Leaving during the draft forfeits the rated duel, discouraging pool rerolls.

Draft requires a registered account, uses its own lobby/queue category and independent persistent `draft_rating`, and can be tested against labeled local bots. The initial rating is 1000 and the per-duel Elo K-factor is 32. Constructed rating is unaffected. Draws score one half. Ratings and results commit in the same transaction. A new match creates a new pool.
