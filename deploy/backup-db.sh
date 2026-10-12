#!/bin/bash
# Nightly backup of the production database, run by the deploy user's crontab on the VPS:
#   30 21 * * * bash /opt/services/digital-dukaan/deploy/backup-db.sh >> $HOME/backups/digital-dukaan/backup.log 2>&1
# Keeps 14 days of dumps on the VPS disk. Restore one with:
#   docker exec -i digital-dukaan-db pg_restore -U digital_dukaan -d digital_dukaan --clean --if-exists --no-owner < FILE.dump
set -euo pipefail
DIR=${BACKUP_DIR:-$HOME/backups/digital-dukaan}
KEEP_DAYS=${KEEP_DAYS:-14}
mkdir -p "$DIR" && chmod 700 "$DIR"
f="$DIR/digital_dukaan-$(date -u +%Y%m%d-%H%M).dump"
docker exec digital-dukaan-db pg_dump -U digital_dukaan -d digital_dukaan -Fc > "$f.part"
# A dump that pg_restore cannot list is not a backup.
docker exec -i digital-dukaan-db pg_restore --list < "$f.part" > /dev/null
mv "$f.part" "$f"
find "$DIR" -name 'digital_dukaan-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok $(du -h "$f" | cut -f1) $f"
