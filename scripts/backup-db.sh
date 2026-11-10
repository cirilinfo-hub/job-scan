#!/usr/bin/env bash
# Dumps the database and resume files, keeping the newest $KEEP_DAYS days. Run daily from cron.
# Expects DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, STORAGE_DIR and BACKUP_DIR in the environment.
set -euo pipefail
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
umask 077
mkdir -p "$BACKUP_DIR"

MYSQL_PWD="$DB_PASSWORD" mysqldump --single-transaction --no-tablespaces --routines \
  -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"
gzip -t "$BACKUP_DIR/db-$STAMP.sql.gz"
tar -czf "$BACKUP_DIR/files-$STAMP.tar.gz" -C "$STORAGE_DIR" .

find "$BACKUP_DIR" -type f \( -name 'db-*.sql.gz' -o -name 'files-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "Backup complete: $STAMP"
