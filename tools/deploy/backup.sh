#!/usr/bin/env bash
# Cold, consistent backup of the embedded database and its signing secret.
set -euo pipefail
exec 9>/run/lock/gachatriad-backup.lock
flock -n 9 || exit 0
backup_dir=/var/backups/gachatriad
install -d -m 0700 "$backup_dir"
was_active=false
if systemctl is-active --quiet gachatriad.service; then
    was_active=true
fi
restore_service() {
    if "$was_active"; then systemctl start gachatriad.service; fi
}
trap restore_service EXIT
systemctl stop gachatriad.service
stamp=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
tar -C /var/lib/gachatriad -czf "$backup_dir/gachatriad-$stamp.tar.gz" postgres auth-secret
# Include private configuration in the same private backup folder.
cp /etc/gachatriad/server.env "$backup_dir/server-$stamp.env"
find "$backup_dir" -maxdepth 1 -type f -name 'gachatriad-*.tar.gz' -mtime +14 -delete
find "$backup_dir" -maxdepth 1 -type f -name 'server-*.env' -mtime +14 -delete
echo "Backup saved: $backup_dir/gachatriad-$stamp.tar.gz"
