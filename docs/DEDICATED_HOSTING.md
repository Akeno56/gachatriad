# Always-on hosting on Netcup and updates

Prepared 8 November 2026. These are installation templates, not an already-provisioned server. Nothing has been purchased or deployed. The existing GitHub Pages + PC setup continues to work.

## Budget and layout

Use **Netcup VPS Lite 1 G12.5s**, with 2 x86 CPU cores, 4 GB RAM, 80 GB SSD and **IPv4 + IPv6 connectivity**. Install Ubuntu 24.04 LTS Minimal. This is the replacement for the unavailable OVH offer; the game and deployment templates work with this Linux VPS.

On 8 November 2026, the [official plan page](https://www.netcup.com/en/server/vps/vps-lite-1-g12.5s-iv-6m) displays €5.86/month including German 19% VAT, equivalent to approximately **€5.91/month with French 20% VAT**. Select **France** in the country/VAT selector and confirm the checkout total. The minimum contract **and billing period are six months**, so expect roughly **€35.46 upfront**, not a €5.91 first payment. The listed setup fee is €0. The page currently warns that provisioning can be delayed.

Budget roughly €10–20/year separately for a domain (an estimate; check renewal pricing). That keeps the average total around €7–8/month, but the first combined server/domain payment can be around €45–55. No paid hosting panel, Windows license or managed database is needed. Capacity for many simultaneous players has not been load-tested.

```text
https://your-domain/       Caddy: HTTPS, static game files
      /api/*              → loopback game service :3001
      /socket.io/*        → same game service, WebSockets
VPS systemd               starts/restarts both services after reboot
/var/lib/gachatriad        permanent database + authentication secret
127.0.0.1:3030             private administration console, SSH access only
```

The browser and server share one origin. No Cloudflare tunnel, manual connection link, or running PC is required. There must be **one game-server process** writing the embedded database; do not launch a second process or add multiple replicas.

## 1. Order and prepare the Netcup VPS

### 1a. Order the right product

Open the [VPS Lite 1 G12.5s order page](https://www.netcup.com/en/server/vps/vps-lite-1-g12.5s-iv-6m), select France for VAT, and keep **IPv4 + IPv6 Connectivity** selected. Complete the account, order and payment steps. Wait until Netcup confirms that the server is provisioned; a payment confirmation alone does not mean it is ready. This plan assigns a European location automatically.

You will use three different panels:

| Panel                                   | Purpose                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| Netcup **CCP** — Customer Control Panel | Customer account, invoices, domains and DNS                  |
| Netcup **SCP** — Server Control Panel   | VPS installation, power, network and emergency screen        |
| Gacha Triad **private host panel**      | Players, moderation, Make admin, boosters, currency and bots |

The [Netcup first-use guide](https://www.netcup.com/en/helpcenter/documentation/server/accessing-server) explains the separate SCP credentials sent by email. Open the SCP through the link in your Netcup account/email, select your server, and note its **public IPv4 address**. Use that address wherever this guide says `YOUR_SERVER_IP`. Do not send account passwords, private keys or root passwords in chat.

### 1b. Create an SSH key on your Windows PC

In **Windows PowerShell**:

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.ssh" | Out-Null
$netcupKey = Join-Path $env:USERPROFILE '.ssh\gachatriad_netcup'
if (-not (Test-Path -LiteralPath $netcupKey)) {
    ssh-keygen -t ed25519 -f $netcupKey -C "Gacha Triad Netcup"
}
Get-Content "$netcupKey.pub"
```

Choose a key passphrase when prompted. If that key filename already exists, reuse it; do not overwrite it. Copy the printed **public key**, the single line beginning `ssh-ed25519`. The file without `.pub` is the private key and stays on your PC.

In Netcup SCP, open **Options → SSH Keys** and add that public key. Netcup can then import it while installing an official image. [Official SSH-key documentation](https://www.netcup.com/en/helpcenter/documentation/server/scp-home#ssh-keys).

### 1c. Install Ubuntu on this new VPS

Netcup normally provisions Debian initially. For this guide, install Ubuntu once on the **new, empty VPS**:

1. Select the VPS in Netcup SCP and open **Media → Images → Official Images**.
2. Choose **Ubuntu 24.04 LTS**, x86-64, then **Minimal**.
3. Choose **a large partition with OS as root partition**, so the OS can use the full disk.
4. Select your uploaded SSH key; choose Europe/Paris for timezone if offered.
5. Click **Install**, complete Netcup's confirmation, and wait for installation to finish. Start the VPS under **Control** if it remains stopped.

This first OS installation erases the VPS disk. **Do not reinstall its image for normal game updates**; section 6 preserves users and game data. Netcup provides a new root password after installation, separate from CCP/SCP passwords. Keep its **Screen** console available for recovery. [Official image-installation instructions](https://www.netcup.com/en/helpcenter/documentation/server/media#official-images).

### 1d. First connection as root, then create the deployment user

In **Windows PowerShell**:

```powershell
ssh -i "$env:USERPROFILE\.ssh\gachatriad_netcup" root@YOUR_SERVER_IP
```

Accept the first host-key prompt after checking that the address is your new server. If the key was not imported, use Netcup's new **OS root password**; SSH does not display characters while you type it. If login fails, use **SCP → Screen** or the [Netcup login guide](https://www.netcup.com/en/helpcenter/documentation/server/troubleshooting-server-login). A host-key-change warning after a deliberate reinstall must be checked against that server before replacing its old saved key.

The next block runs **inside that root SSH session on the VPS**:

```bash
apt update
apt install -y sudo nano openssh-server
adduser deploy
usermod -aG sudo deploy
install -d -m 0700 -o deploy -g deploy /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys
```

`adduser` asks you to set a password for `deploy`; remember it because `sudo` will request it later. In Nano, paste your **public** key from step 1b as one line, save with Ctrl+O, Enter, then exit with Ctrl+X. Finish in the same root session:

```bash
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 0600 /home/deploy/.ssh/authorized_keys
```

Leave this root session open temporarily. Open a **second Windows PowerShell window** and verify the new login:

```powershell
ssh -i "$env:USERPROFILE\.ssh\gachatriad_netcup" deploy@YOUR_SERVER_IP
```

Inside this second SSH session:

```bash
whoami
sudo -v
```

`whoami` must print `deploy`; `sudo -v` must accept the deploy user's password. **Use this deploy session for all remaining VPS commands.** The updater intentionally refuses to run as root.

### 1e. Save a short SSH connection name

On **Windows**, open your SSH configuration:

```powershell
notepad "$env:USERPROFILE\.ssh\config"
```

Add this block, replacing `YOUR_SERVER_IP`. If the file already contains other hosts, append the block instead of replacing them:

```sshconfig
Host gachatriad
    HostName YOUR_SERVER_IP
    User deploy
    IdentityFile ~/.ssh/gachatriad_netcup
    IdentitiesOnly yes
    ServerAliveInterval 30
```

From a fresh PowerShell window, `ssh gachatriad` should now connect as `deploy`. Later update/admin commands use this saved name.

### 1f. Configure the firewall and finish SSH setup

Run on the **VPS as deploy**, keeping the original root session and Netcup Screen available until a new connection succeeds:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates xz-utils unzip ufw gnupg openssl debian-keyring debian-archive-keyring apt-transport-https
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Leave Netcup's SCP firewall on its initial/default policy during this setup; UFW supplies the inbound restrictions above. If you already applied a custom SCP policy, it must also permit SSH/HTTP/HTTPS and retain necessary network services. Adding a custom rule can change Netcup's implicit policy to DROP; keep outbound networking allowed and retain the provider's required DNS/DHCP rules. [Netcup firewall documentation](https://www.netcup.com/en/helpcenter/documentation/server/firewall). Do not expose ports 3001 or 3030.

After the deploy key login is verified, configure key-only SSH:

```bash
sudo tee /etc/ssh/sshd_config.d/00-gachatriad.conf >/dev/null <<'EOF'
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
if sudo /usr/sbin/sshd -t; then
    sudo systemctl reload ssh
fi
```

If the configuration check prints an error, correct it before reloading. Test `ssh gachatriad` again from a new PowerShell window. Only then close the original root session. Netcup's Screen remains the recovery route if SSH is unavailable.

For the 4 GB VPS, a 2 GB swap file helps avoid build-time memory spikes. Run `swapon --show` first; only create this file if there is no existing swap or `/swapfile`:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 1g. Point your domain at the VPS

Register a domain at Netcup or another registrar. For a newly registered Netcup domain, open **CCP → Domains → magnifying-glass/details → CloudDNS**. Older domains may show **DNS** instead. Edit DNS records here; leave the Nameserver and Zone SOA settings unchanged. For `game.example.com`, the record's Host is `game`; for the bare `example.com`, use `@`. Replace conflicting parking A records for that same hostname. Add AAAA only after configuring/testing the VPS IPv6; remove an old AAAA for this hostname if it points elsewhere. [Netcup CloudDNS instructions](https://www.netcup.com/en/helpcenter/documentation/domain/dns-settings-cloud-dns).

For the selected **gachatriad.com** domain and VPS **62.83.93.199**, the Domain Parker preset currently shows two A records (`@` and `*`) pointing at `46.38.243.234`. Change both existing Destination/Data fields to **62.83.93.199**, leave their TTL at **3600** and Priority blank, then click **Apply changes below the Zone entries**, not the separate Zone SOA button. `@` is the main domain; `*` supplies a wildcard for otherwise unspecified subdomains. Their websites still need to be configured in Caddy before serving them.

Use the **same full hostname** everywhere this guide says `game.example.com`. In Windows PowerShell, check it resolves to your server before enabling HTTPS:

```powershell
Resolve-DnsName game.example.com -Type A
```

DNS changes may take time to appear. Buying the VPS alone does not register a domain or configure its DNS.

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
ssh -t gachatriad "bash /opt/gachatriad/source/tools/deploy/update.sh https://game.example.com"
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
ssh -N -L 3030:127.0.0.1:3030 gachatriad
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

The timer takes a cold database + auth-secret backup around 03:30 Paris time, briefly pausing the game, and retains approximately 14 days under private `/var/backups/gachatriad`. Netcup snapshots can complement this; do not assume the plan includes an automatic daily provider backup. For a full VPS recovery point before major OS changes, Netcup recommends an offline snapshot. Regularly download an additional application backup off the VPS. Treat archives and `.env` backups as credentials. Test restoration on a separate stopped instance before relying on it. [Netcup snapshot documentation](https://www.netcup.com/en/helpcenter/documentation/server/media#3-snapshots).

For a manual restore: stop **both** services; preserve the current data folder separately; extract the chosen archive into a new empty `/var/lib/gachatriad`; restore ownership to `gachatriad:gachatriad` and private permissions; restore a matching private environment configuration if needed; start one game service and inspect logs before reopening play. Never extract over a running database.

## Deployment limits

The private administration API is denied by the public Caddy route, and the console only listens on loopback. The configuration is a starting point for this small beta, not a claim that the game is penetration-tested or ready for unlimited public traffic. Keep OS/Node dependencies patched, backups checked, provider 2FA enabled and the private console off the public internet. The earlier [security review](SECURITY_REVIEW.md) still applies.
