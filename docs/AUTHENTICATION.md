# Local authentication and profiles

Better Auth provides anonymous and email/password accounts with server-side sessions and HttpOnly cookies. The UI creates an anonymous session on first visit, then requests its profile. A persistent profile receives its starter grant once; repeated requests and reloads do not grant extra cards. Passwords require at least ten characters. Email verification and reset delivery are not configured; OAuth is future work.

Registering while signed in as a guest preserves its profile, inventory and history. Signing into an existing account preserves that account's primary profile and attaches the current guest profile as an additional selectable profile. Profiles are not merged. Changing the selected profile is checked server-side on every API request and socket connection. An account cannot join its own table from another profile.

Ranked, rated Draft, Trade One and card exchange require a registered session. Guest practice, decks, unranked/custom/Roulette and browsing remain available. A logout creates a fresh guest session when visiting again; registered progress remains in its account.

Set `BETTER_AUTH_SECRET` for a managed deployment. Otherwise a random secret is written once to ignored `.data/auth-secret`; it survives local restarts. Keep it with the database. `CLIENT_ORIGIN` defaults to `http://127.0.0.1:3000`; `http://localhost:3000` is also trusted. Other mutation origins are rejected. The backend binds to loopback and defaults to port 3001. Configure origins, TLS, mail and external database/coordination before public hosting.

Bot identities have no password credential. The local population manager provisions their persistent profiles and calls the same game/trade methods as authenticated users. Bots are named `[BOT] …`, never counted as human players, and can be paused from Lobbies or Trades.
