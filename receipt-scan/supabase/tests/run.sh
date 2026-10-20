#!/usr/bin/env bash
# Runs the security tests against a throwaway local Postgres (no Supabase needed).
# Usage: PGHOST=localhost PGUSER=postgres ./supabase/tests/run.sh      (needs psql + a running Postgres 14+)
set -euo pipefail
cd "$(dirname "$0")"
DB="resiboscan_test_$$"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
createdb "$DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f 00_supabase_stub.sql
for m in ../migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$m"; done
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f 01_security.test.sql 2>&1 | sed -n 's/^.*NOTICE:  //p'
echo "ALL DATABASE SECURITY TESTS PASSED"
