#!/usr/bin/env bash
set -euo pipefail

echo "=== Running Supabase migrations ==="

MIGRATIONS_DIR="supabase/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "No migrations directory found"
  exit 0
fi

MIGRATION_COUNT=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l)

if [ "$MIGRATION_COUNT" -eq 0 ]; then
  echo "No migration files found"
  exit 0
fi

echo "Found $MIGRATION_COUNT migration files"

if command -v supabase &> /dev/null; then
  echo "Using Supabase CLI..."
  supabase db push
else
  echo "Supabase CLI not found, using psql directly"
  echo "Make sure PGHOST, PGUSER, PGDATABASE, PGPASSWORD are set"

  for f in "$MIGRATIONS_DIR"/*.sql; do
    echo "Applying $f..."
    psql -f "$f"
  done
fi

echo "✅ Migrations complete"
