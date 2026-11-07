# GitHub Pages frontend + game server on your PC

The intended layout is:

```text
Your browser / friend's browser
    ↓ HTTPS
https://akeno56.github.io/gachatriad/   (static game, hosted by GitHub)
    ↓ HTTPS requests + WebSocket notifications
temporary Cloudflare session URL
    ↓ local tunnel
127.0.0.1:3001                       (game server on your PC)
    ↓
.data/postgres + .data/auth-secret   (accounts, inventory and matches)

127.0.0.1:3030                       (private PC control panel)
```

The frontend does not run the game server. Both players must use the same server address. Your PC and the game server must be running while you play. The control panel is not forwarded through the public tunnel.

## 1. Create the repository

Sign in as **Akeno56**, open [New repository](https://github.com/new), choose **gachatriad**, and choose Public for a GitHub Free Pages site. Leave the README, license and gitignore initialization unchecked because this project already supplies its files. Create the repository.

In PowerShell in `E:\DEVPRG\Codex\GachaTriad`:

```powershell
git init -b main
git add .
git commit -m "Prepare Gacha Triad demo"
git remote add origin https://github.com/Akeno56/gachatriad.git
git push -u origin main
```

Git may open a browser for GitHub sign-in on the first push. If Git requests your author name/email, configure those with your own GitHub identity, then repeat the commit. If you already initialized the repository, reuse it rather than running `git init` or adding a duplicate remote.

Ignored `.data`, `.cache`, `.tools`, `.env`, `kyaraData`, `prydwenData`, `node_modules`, test traces and local exports stay on your PC. The game sources, published character art, music playback copy and GitHub workflow are committed. Keep the local save and auth secret together; neither belongs in the repository.

## 2. Enable Pages

In **Akeno56/gachatriad → Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. Then open the project's [Publish game to GitHub Pages workflow directly](https://github.com/Akeno56/gachatriad/actions/workflows/pages.yml), click **Run workflow**, select **main**, and confirm **Run workflow**. Later pushes to `main` rebuild and deploy automatically.

The workflow is supplied by this project's `.github/workflows/pages.yml`; it is not one of GitHub's suggested templates. If Actions still shows “Choose a workflow,” refresh or use the direct link above. Do not configure an additional Next.js template. The initial push may run before Pages is enabled and fail at **Configure Pages** with “Get Pages site failed / Not Found.” After selecting GitHub Actions as the Pages source, run the workflow again (or open that failed run and choose **Re-run all jobs**).

The workflow installs Node 24 and pnpm 11.9, builds a static export, and uploads only `apps/web/out`. The expected address is **https://akeno56.github.io/gachatriad/**. A user site at the root would instead require the repository name `akeno56.github.io`; this project is prepared as a project site named `gachatriad`.

The workflow calculates its base path from the repository name. Portraits, fonts, music and links respect that path. It contains no fixed public server address, so a new tunnel link does not require redeploying Pages.

The workflow uses Node 24-compatible Pages actions (`configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`) and pins both jobs to `ubuntu-24.04`. Older successful runs may still show Node 20 deprecation warnings or notices about `ubuntu-latest` changing versions; annotations on historical runs do not disappear when the workflow is updated. Commit and push the updated workflow to use the new versions on the next deployment.

## 3. Start the PC control tool

On Windows, double-click **Start Server Control.cmd** in the project folder. It starts the private panel in the background and opens **http://127.0.0.1:3030** in your browser. The launcher window stays open to show the panel address and any error; press a key to close it. If Windows does not open a browser, open that address manually. Opening the launcher again reuses the running panel. Use the panel's **Start server**, **Shut down server** and **Restart server** buttons; closing the browser does not stop the server.

On this development PC, Node and the project dependencies are already installed, so the launcher needs no pnpm commands. A local frontend build is optional when playing through GitHub Pages.

For a fresh installation, first install [Node.js 24 LTS](https://nodejs.org/en/download) with **Add to PATH** enabled, then close and reopen PowerShell. Run these commands once from the project folder:

```powershell
npm.cmd install --global pnpm@11.9.0
pnpm.cmd install
```

The `.cmd` suffix avoids PowerShell script execution-policy errors. After installation, use the double-click launcher. Developers can also build the optional local frontend preview and run the panel from a terminal:

```powershell
pnpm build:pages
pnpm control
```

Stop `pnpm dev` or `pnpm start` first; they otherwise occupy the same game ports. When using `pnpm control` directly, keep its terminal running. The double-click launcher does not require an open terminal. Launcher diagnostics are saved in `.data/control-launcher.log`.

The panel can start, shut down and restart the game server, show its log, list real connected players and their current match, and save your frontend URL. The default frontend URL is `https://akeno56.github.io/gachatriad/`. Saving settings restarts a running server to apply its allowed origin. Demo bots are optional; leave them off when you want your friend to join your waiting table. If enabled, all bots remain labeled and use the real local save.

If `apps/web/out` exists and port 3000 is free, the panel also serves a local copy of the static game. **Open local game preview** tests the same client build that Pages hosts. Build the Pages frontend again after changing game UI code; the control panel uses the current exported files.

## 4. Open an HTTPS game session

Click **Start server**. Then click **Install tunnel helper** once. It downloads the Windows x64 `cloudflared` executable from Cloudflare's official GitHub release into ignored `.tools`, checks the release digest when provided, and does not install a Windows service.

Do not double-click `cloudflared.exe`. The panel runs it in the background when you click **Start public link**.

Click **Start public link**, then **Copy invitation link**. Send that full invitation link to your friend. It points at your GitHub Pages game and includes the temporary HTTPS backend address. Each player clicks **Connect to server**, then plays as a separate guest or signs into a separate account. New players complete the short tutorial or acknowledge the rulebook before their first duel.

In Lobbies, create a custom table or use Unranked. The other player joins the same 1/2 waiting table. Both clients then use one server-owned match. Hidden cards are redacted; moves, timers, outcomes and trades are validated by the PC server. Ranked, Draft and card exchanges require registered accounts; unranked/custom/Roulette support guests.

The controller forwards only port 3001 through the tunnel. You do not need to forward router ports. **Close public link** removes internet access while leaving the local game server running. **Shut down server** also closes its tunnel. Restarting just the game server keeps the current public URL; clients reconnect and refetch their stored match. Game deadlines continue to use wall-clock time, so stop long-running online matches before lengthy maintenance.

## Bot tools and account moderation

The private PC console includes **Bot population** controls, a searchable list of players, and **Make admin / Remove admin**, **Suspend / Restore access**, and **Disconnect** actions. Sign into the game with your registered account, find it in the console, and click **Make admin**. Guests cannot be promoted. Only explicitly appointed registered administrators can see or use bot controls inside the game; regular accounts and guests are rejected by the API too. The server host can always manage bots from the private console.

Pausing population closes bot waiting tables and trade offers; existing duels finish. Suspension blocks the selected auth account across its linked profiles, disconnects sockets, closes waiting tables and forfeits active duels using normal settlement. Restore access reverses the suspension. Disconnect only drops socket connections and does not prevent reconnecting. Moderation actions are recorded in the local database. No account is automatically made admin by registering first or by choosing a name/email.

## Publish later changes

The GitHub Pages client and your PC server update separately. From Git Bash or PowerShell in the project folder, publish the code changes with:

```sh
git add .
git commit -m "Add boosters, Stellar Prisms and server moderation"
git push
```

The existing **Publish game to GitHub Pages** workflow runs automatically on a push to `main`. Wait for its build and deploy jobs to turn green, then reload `https://akeno56.github.io/gachatriad/` with **Ctrl+F5**. No additional pnpm command is needed to publish; GitHub installs/builds the frontend.

For the local host tools, use **Exit control tool**, then double-click **Start Server Control.cmd** again and click **Start server**. This reloads the updated controller and backend. A server-only restart reloads backend code, but does not reload the running controller's own code. **Exit control tool** closes the public tunnel, so click **Start public link** again and share the new invitation. Keep `.data` to preserve accounts, collections, currency and admin assignments; the server applies migrations on startup.

New profiles receive three free boosters. Existing profiles keep their previous cards and can earn Prisms to buy more. The local preview uses `apps/web/out`; this coding session rebuilt it. After future UI edits, developers can run `pnpm build:pages` to refresh that optional preview. GitHub Pages builds independently.

## Session behavior

Cross-site requests use Better Auth's signed bearer-token support, including the WebSocket handshake. This avoids relying on third-party cookies between `github.io` and the temporary tunnel hostname. The local same-origin build continues to support HttpOnly cookies. Browser tokens and selected profiles are scoped to the chosen server address and never sent to an address from an unconfirmed invitation.

Cloudflare Quick Tunnel is a development/demo facility. Its hostname changes when the tunnel restarts, and it has no uptime guarantee. Share the new invitation link after a tunnel restart. Registered accounts remain in the same PC database; sign in again at the new address. A guest session belongs to its original browser/server address, so register to preserve convenient access before changing the public hostname. A stable named tunnel can replace the temporary URL later.

## Settings

The panel saves its configuration in ignored `.data/server-control.json`. Game data remains in `.data/postgres`; the signing secret is `.data/auth-secret`. Optional environment overrides include `CONTROL_PORT`, `SERVER_PORT`, `PREVIEW_PORT`, `DATA_DIR` and `CLOUDFLARED_PATH`.

For manual server hosting, `CLIENT_ORIGIN` is the frontend's origin, `ALLOWED_ORIGINS` adds comma-separated origins, `BETTER_AUTH_URL` is the API's public origin, and `SERVER_HOST` defaults to `127.0.0.1`. The controller supplies these for you. The private connected-player endpoint requires a per-controller secret and is not available to players.

## Verified scope

The automated host check starts the local control tool, connects two independent browser sessions to the static export through a separate backend origin, plays a complete Elemental duel, clears cookies and refreshes using signed tokens, and checks connected-player reporting, stop/start/restart and match/inventory persistence. Run `pnpm test:host` to repeat it with isolated ports and a test save.

An additional, explicitly approved public-relay check passed HTTPS signed guest authentication, two WSS clients, a shared lobby and a complete Elemental duel through Cloudflare. It used fresh guests in an isolated save and closed its temporary relay afterward. The main save/accounts were not used. This verifies the relay transport; the actual GitHub-hosted frontend still requires the publishing steps above.

The repository has already deployed an earlier build. Changes in this coding session remain local until you commit and push them using **Publish later changes** above. Opening your regular public link remains a host control-panel action.

References: [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [Better Auth bearer authentication](https://better-auth.com/docs/plugins/bearer).
