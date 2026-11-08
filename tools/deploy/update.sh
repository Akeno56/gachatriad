#!/usr/bin/env bash
# Run as the SSH deployment user, never as root. No player data lives in a release.
set -euo pipefail
umask 022
if [ "$(id -u)" -eq 0 ]; then echo 'Run this as your normal SSH user, not root.' >&2; exit 1; fi
base=/opt/gachatriad
origin=${1:?Usage: update.sh https://your-domain [origin/main-or-commit]}
revision=${2:-origin/main}
export PATH=/opt/node24/bin:/usr/local/bin:/usr/bin:/bin
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
cd "$base/source"
git fetch origin
commit=$(git rev-parse --verify "$revision^{commit}")
release="$base/releases/$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}"
mkdir -p "$release"
git archive "$commit" | tar -x -C "$release"
cd "$release"
pnpm install --frozen-lockfile
# Generate Next's route declarations in this fresh release before the workspace check.
PUBLIC_SITE_URL="$origin" pnpm build:hosted
pnpm typecheck
pnpm assets:validate
test -s apps/web/out/index.html
previous=$(readlink -f "$base/current" || true)
if [ -n "$previous" ] && [ -d "$previous" ]; then
    # The root-owned helper briefly stops the single database writer.
    sudo /usr/local/sbin/gachatriad-backup
fi
sudo systemctl stop gachatriad-admin.service gachatriad.service
ln -sfnT "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
sudo systemctl start gachatriad.service || true
healthy=false
for attempt in {1..30}; do
    if curl --fail --silent --max-time 2 http://127.0.0.1:3001/api/health >/dev/null; then healthy=true; break; fi
    sleep 1
done
if ! "$healthy"; then
    echo 'Health check failed; restoring the previous code release.' >&2
    sudo systemctl stop gachatriad.service
    if [ -n "$previous" ] && [ -d "$previous" ]; then
        ln -sfnT "$previous" "$base/current.next"
        mv -Tf "$base/current.next" "$base/current"
        sudo systemctl start gachatriad.service gachatriad-admin.service
    fi
    echo 'Player data was not restored automatically. Inspect journalctl and the backup before retrying.' >&2
    exit 1
fi
if [ -n "$previous" ] && [ -d "$previous" ]; then
    ln -sfnT "$previous" "$base/previous.next"
    mv -Tf "$base/previous.next" "$base/previous"
fi
sudo systemctl start gachatriad-admin.service
echo "Deployed $commit to $origin. Player data remains in /var/lib/gachatriad."
