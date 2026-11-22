#!/usr/bin/env bash
# Applies migration 0135 TWICE to a throw-away local Postgres that holds a minimal copy of the tables it touches, and checks the backfill and the mobile-matching function.
# Needs the PostgreSQL server binaries (initdb, pg_ctl, psql). Run as root: it uses the 'postgres' user.   Usage: bash scripts/db/check-migration-0135.sh
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin | head -1); D=/tmp/pgmig-check; rm -rf $D; mkdir $D; chown postgres $D
su postgres -c "$BIN/initdb -D $D/data -A trust >/dev/null && $BIN/pg_ctl -D $D/data -o '-p 5545 -k $D' -l $D/log start >/dev/null"; sleep 3
q() { su postgres -c "psql -h $D -p 5545 -d postgres -Atq -v ON_ERROR_STOP=1 $*"; }
q "-f $(pwd)/scripts/db/migration-0135-fixture.sql"; q "-f $(pwd)/supabase/migrations/0135_chat_identity.sql" 2>/dev/null; q "-f $(pwd)/supabase/migrations/0135_chat_identity.sql" 2>/dev/null
echo "backfill (no old link may be verified or existing):"; q "-c \"select id, contact_status, coalesce(link_state,'-'), coalesce(link_basis,'-') from chat_conversations order by id\""
BAD=$(q "-c \"select count(*) from chat_conversations where contact_status = 'existing' or link_state in ('verified','staff')\""); [ "$BAD" = "0" ] && echo "OK: nothing was promoted to verified/existing" || { echo "FAIL: $BAD rows were promoted"; exit 1; }
echo "mobile function:"; for n in "09175551212" "+63 917 555 1212" "639175551212" "917-555-1212" "0919 000 1111" "12345"; do printf "  %-20s -> " "$n"; q "-c \"select coalesce(string_agg(id, ','), '(none)') from public.chat_clients_by_mobile('$n')\""; done
su postgres -c "$BIN/pg_ctl -D $D/data stop -m fast >/dev/null"; echo done
