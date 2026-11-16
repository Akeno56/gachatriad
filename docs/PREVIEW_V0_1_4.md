# Test 0.1.4 on GitHub Pages before the VPS

The preview frontend is https://akeno56.github.io/gachatriad/. GitHub Pages serves the frontend only. The new puzzle, Shared Draft and rating fields require the updated server too; connecting this preview to the old VPS is not a complete test.

Use the separate PC test server:

1. Double-click **Start Test Server Control.cmd** in the project folder. Its panel is **http://127.0.0.1:3040**, marked **TEST SERVER · PC**. Leave the VPS/SSH panel on 3030 alone.
2. Click **Start server**, then **Start public link**. The existing tunnel helper can expose the test backend over HTTPS. The test server uses port **3101** and its separate **.data-local** save. Existing test progress is retained.
3. Click **Copy invitation link**. Open that complete link, which combines the GitHub Pages address with the temporary test-server address. Confirm **Connect to server**. Check the server address ends in **trycloudflare.com**, rather than **gachatriad.com**.
4. Press **Ctrl+F5** on Pages. The top bar must show **Alpha · 0.1.4**. Use fresh email/password test accounts; these belong to the test server. Production accounts and progress are separate.

Keep the PC, test server and public link running while testing. If the tunnel restarts, copy its new invitation link. Do not run the VPS update command until the preview is approved.

## Suggested test order

| Check                               | Expected result                                                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home, navigation and queue controls | Both Draft buttons are present; English and French labels fit. Try a phone as well.                                                                                                                |
| Daily puzzle                        | Reveal, play and retry if needed. A first win earns 100 Prisms and appears on the daily leaderboard. Reload and practise again: no second reward.                                                  |
| Original Draft                      | Three private boosters, then choose and lock five of 15 cards. The opponent has its own pool. Battle uses Three Open.                                                                              |
| Shared Draft                        | Four boosters form the same 20-card pool for both players. Alternate five picks each; a taken card is unavailable to the opponent. Reload during drafting to check recovery. Battle uses All Open. |
| Ratings                             | Complete human games in both Draft formats. Each rating changes independently, and Ladder has Ranked, Draft and Shared Draft tabs. Bot practice never changes Elo.                                 |
| Ordinary Ranked                     | Note the deck and inventory, lose a match, then queue again. The cards and deck remain intact; no card-selection settlement is required.                                                           |
| Custom Trade One                    | Both players explicitly choose a staked custom game. The winner still claims one card.                                                                                                             |
| Long session                        | Leave the preview open, return and play with music on. Check portrait/music loading and responsiveness; repeat on the phone.                                                                       |

For a solo test, join a rated queue, then explicitly choose **Play a practice bot — no Elo**. Populate bots using the **test** panel if needed. To check Elo, use a second human test account. If testing household accounts, use the panel's existing shared-network exception controls as appropriate; a second browser alone does not bypass the account/IP policy.

Google/Discord production callback URLs remain unchanged. Use email accounts for this feature pass; OAuth against a temporary tunnel requires separately configured test callbacks and credentials.

When reporting a problem, include the mode, language, device, steps and screenshot. For lag, include the slow request's Timing breakdown and `Server-Timing` response header. Do not send passwords, session tokens or OAuth secrets.

## After testing

Close the public link and stop the **test** server when finished. Production is updated separately using the existing VPS deployment process, preserving its persistent data. A GitHub Pages deployment alone does not run that process.
