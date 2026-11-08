# Always-on hosting and updates

Prepared 8 November 2026. These are installation templates, not an already-provisioned server. Nothing has been purchased or deployed. The existing GitHub Pages + PC setup continues to work.

## Budget and layout

Choose a **VPS**, not a physical dedicated server. For a small friend/beta release, my recommendation is OVHcloud VPS-1, Ubuntu 24.04 LTS, x86-64, in France or nearby Europe. The current French offer advertises 2 vCores, 4 GB RAM and 40 GB NVMe **from €4.57/month including VAT**. VPS-2 advertises 4 vCores / 8 GB / 75 GB from €8.65 including VAT. Check monthly billing, renewal price and taxes at checkout; “from” prices can depend on terms or promotions. [Official prices](https://www.ovhcloud.com/fr/vps/).

Budget roughly €10–15/year for a domain (an estimate; check its renewal price). VPS-1 plus a domain should comfortably fit €10/month. VPS-2 gives build-time headroom if its final checkout price also fits. No paid hosting panel, Windows license or managed database is needed. Capacity for many simultaneous players has not been load-tested.

```text
https://your-domain/       Caddy: HTTPS, static game files
      /api/*              → loopback game service :3001
      /socket.io/*        → same game service, WebSockets
VPS systemd               starts/restarts both services after reboot
/var/lib/gachatriad        permanent database + authentication secret
127.0.0.1:3030             private administration console, SSH access only
```

The browser and server share one origin. No Cloudflare tunnel, manual connection link, or running PC is required. There must be **one game-server process** writing the embedded database; do not launch a second process or add multiple replicas.

## 1. Choose the domain and VPS

Order the Linux VPS with an SSH key and no commercial control panel. Buy a domain you like; it does not have to match the GitHub repository name. In its DNS, add an **A record** for the chosen hostname to the VPS IPv4 address. Only add AAAA if the VPS IPv6 is configured correctly. `game.example.com` throughout this guide is a placeholder to replace.

Use the provider's initial normal sudo-enabled SSH user (often `ubuntu`). Connect from PowerShell:

```powershell
ssh ubuntu@YOUR_SERVER_IP
```

The following shell blocks run **on the VPS**, not on Windows. Keep the provider console available while configuring the firewall. Allow SSH before enabling it:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates xz-utils unzip ufw gnupg openssl debian-keyring debian-archive-keyring apt-transport-https
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

If using the provider firewall as well, allow 22, 80 and 443 there. Do not open 3001 or 3030. Once SSH-key access is verified, disable password/root SSH login and preferably restrict SSH to your own IP if stable.

For the 4 GB VPS, a 2 GB swap file helps avoid build-time memory spikes. Only create it if `swapon --show` shows no existing swap:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Install Node and Caddy once

This pins the version already tested by the project and verifies the archive checksum. See the [official Node 24.22.2 release](https://nodejs.org/en/blog/release/v24.22.2). Keep Node updated with later security patches as part of server maintenance.

```bash
mkdir -p ~/gachatriad-runtime
cd ~/gachatriad-runtime
curl -fSLO https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz
curl -fSLO https://nodejs.org/dist/v24.22.2/SHASUMS256.txt
grep ' node-v24.22.2-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum -c -
sudo mkdir -p /opt/node24
sudo tar -xJf node-v24.22.2-linux-x64.tar.xz --strip-components=1 -C /opt/node24
sudo env PATH=/opt/node24/bin:/usr/bin:/bin /opt/node24/bin/npm install --global pnpm@11.9.0
export PATH=/opt/node24/bin:$PATH
```

Install Caddy using its [official Ubuntu repository](https://caddyserver.com/docs/install#debian-ubuntu-raspbian):

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## 3. Prepare the project and private settings

First commit/push the current project changes from your PC. The updater deploys committed Git versions, so uncommitted files do not get published.

On the VPS, create the deployment directory owned by your SSH user, and a separate non-login game service user:

```bash
sudo useradd --system --user-group --home-dir /var/lib/gachatriad --shell /usr/sbin/nologin gachatriad
sudo install -d -o "$USER" -g "$(id -gn)" -m 0755 /opt/gachatriad /opt/gachatriad/releases
git clone https://github.com/Akeno56/gachatriad.git /opt/gachatriad/source
sudo install -d -o gachatriad -g gachatriad -m 0700 /var/lib/gachatriad
sudo install -d -m 0700 /etc/gachatriad
sudo install -m 0600 /opt/gachatriad/source/tools/deploy/server.env.example /etc/gachatriad/server.env
openssl rand -hex 32
sudo nano /etc/gachatriad/server.env
```

In the editor replace **all three `game.example.com` origins** and `FRONTEND_URL` with your actual hostname. Replace `LOCAL_CONTROL_SECRET` with the generated random string. Save with Ctrl+O, Enter, Ctrl+X. Never put this file or the database in Git or the public directory.

Install root-owned service/backup definitions. The game runs as the restricted service user; dependency installation and builds run as your SSH user.

```bash
sudo install -m 0644 /opt/gachatriad/source/tools/deploy/gachatriad.service /etc/systemd/system/
sudo install -m 0644 /opt/gachatriad/source/tools/deploy/gachatriad-admin.service /etc/systemd/system/
sudo install -m 0755 /opt/gachatriad/source/tools/deploy/backup.sh /usr/local/sbin/gachatriad-backup
sudo install -m 0644 /opt/gachatriad/source/tools/deploy/gachatriad-backup.service /etc/systemd/system/
sudo install -m 0644 /opt/gachatriad/source/tools/deploy/gachatriad-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

## 4. Start with a completely clean server

The requested v0.13 pre-hosting wipe deletes **all users**, including old admins, as well as every account's cards, currency, ratings, matches, social data and chat. The local wipe is complete; a private recovery copy is retained in ignored `.cache`. See [the reset receipt](RESET_V13.md).

**Do not upload the PC `.data` folder or any old backup to the VPS.** Leave `/var/lib/gachatriad` empty for first deployment. The game creates a new database and signing secret automatically. No old users are migrated and no default admin password is installed.

After the website is running:

1. Register a new normal account on your website. A guest cannot be made admin.
2. Open the private host panel through the SSH forwarding described in section 7.
3. In **Moderation**, find your new account and click **Make admin**.
4. Refresh the game; that account now has in-game administrator permissions.

The private host panel is authorized by your server/SSH access and its private control secret. It does not require a pre-existing game administrator. You can use it to appoint another admin later even if all previous game admins have been removed. Public registration never automatically awards admin rights.

## 5. First deployment and HTTPS

The same command handles both the first release and later updates:

```bash
bash /opt/gachatriad/source/tools/deploy/update.sh https://game.example.com
```

It fetches `origin/main`, extracts a clean version into a new release folder, installs locked dependencies, checks types and builds the site for your hostname. Only after a successful build does it switch `current` and start the services. Allow several minutes on the small VPS. Enter your sudo password when requested.

Set up Caddy after the first successful release:

```bash
sudo install -m 0644 /opt/gachatriad/current/tools/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl enable gachatriad.service gachatriad-admin.service
sudo systemctl enable --now gachatriad-backup.timer
```

Replace `game.example.com` in the Caddyfile before validation. With correct public DNS and ports 80/443 reachable, Caddy obtains/renews HTTPS certificates. Its reverse proxy also handles the game's WebSocket connection. [Caddy HTTPS documentation](https://caddyserver.com/docs/automatic-https), [reverse proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

Visit your HTTPS address. Test guest creation, account login, a duel between two browsers, and the private panel. Then reboot the VPS once and verify the game comes back automatically. Your PC can be switched off.

## 6. Publish updates in one command

On Windows, commit and push the new version as usual:

```powershell
git add .
git commit -m "Update Gacha Triad"
git push
ssh -t ubuntu@YOUR_SERVER_IP "bash /opt/gachatriad/source/tools/deploy/update.sh https://game.example.com"
```

That final command deploys **both frontend and backend**. Player data stays outside the release in `/var/lib/gachatriad`. The old game keeps running during the build, a consistent backup is taken before switching, then the services restart and a health check runs. Expect a short maintenance interruption, so update between games. Match timers still use wall-clock time. Players should refresh after an update so open tabs load the new page assets.

If the new service fails its health check, the updater attempts to return to the previous code release. It does **not** automatically restore the database, since that could discard new player activity. It keeps a `previous` symlink and the cold backup for inspection. Do not assume an older release supports a newer database migration.

To deploy a known earlier compatible commit, pass its Git SHA as a second argument:

```bash
bash /opt/gachatriad/source/tools/deploy/update.sh https://game.example.com COMMIT_SHA
```

Changes to service definitions, backup scripts or Caddy configuration are installed/reloaded separately using section 3/5; normal game updates do not overwrite private environment settings. The source checkout is an updater workspace; releases are extracted from Git, not from its working-tree edits. Occasionally run `git -C /opt/gachatriad/source pull --ff-only` to refresh the updater script itself after reviewing changes.

Old release folders are retained for recovery. Check `df -h /opt/gachatriad` and remove only deliberately selected old releases after verifying that neither `current` nor `previous` points to them. Avoid letting builds/backups fill the disk.

## 7. Administration and backups

From PowerShell open a private SSH forwarding session:

```powershell
ssh -N -L 3030:127.0.0.1:3030 ubuntu@YOUR_SERVER_IP
```

Keep that window running, then open **http://127.0.0.1:3030** locally. If the old PC panel already uses 3030, exit that control tool first; closing only its browser tab does not release the port. Keep the local and remote console ports identical because the console checks its request Host and Origin. The panel supports moderation, administrator assignment, currency/booster grants and bot settings against the hosted server. OS service management owns start/stop/restart in this setup, so the panel cannot launch a second database writer or a public tunnel.

Useful VPS commands:

```bash
sudo systemctl status gachatriad gachatriad-admin caddy
sudo journalctl -u gachatriad -n 80 --no-pager
sudo systemctl restart gachatriad
sudo /usr/local/sbin/gachatriad-backup
sudo systemctl list-timers gachatriad-backup.timer
```

The timer takes a cold database + auth-secret backup around 03:30 Paris time, briefly pausing the game, and retains approximately 14 days under private `/var/backups/gachatriad`. The provider backup is useful too, but regularly download an additional backup off the VPS. Treat archives and `.env` backups as credentials. Test restoration on a separate stopped instance before relying on it.

For a manual restore: stop **both** services; preserve the current data folder separately; extract the chosen archive into a new empty `/var/lib/gachatriad`; restore ownership to `gachatriad:gachatriad` and private permissions; restore a matching private environment configuration if needed; start one game service and inspect logs before reopening play. Never extract over a running database.

## Deployment limits

The private administration API is denied by the public Caddy route, and the console only listens on loopback. The configuration is a starting point for this small beta, not a claim that the game is penetration-tested or ready for unlimited public traffic. Keep OS/Node dependencies patched, backups checked, provider 2FA enabled and the private console off the public internet. The earlier [security review](SECURITY_REVIEW.md) still applies.
