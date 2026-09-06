#!/usr/bin/env bash
set -euo pipefail

echo "=== Checking for secrets in codebase ==="

PATTERNS=(
  'SUPABASE_SERVICE_ROLE_KEY'
  'SERVICE_ROLE_KEY'
  'INTERNAL_EDGE_TOKEN'
  'sk-or-'
  'r8_'
  'ELEVENLABS_API_KEY'
  'PRODAMUS_API_KEY'
  'PAY_SELECTION_API_KEY'
  'LAVATOP_API_KEY'
  'CRYPTOCLOUD_API_KEY'
  'OPENROUTER_API_KEY'
  'REPLICATE_API_TOKEN'
  'FAL_KEY'
  'password.*=.*['\''"][A-Za-z0-9]'
  'token.*=.*['\''"][A-Za-z0-9]'
)

FOUND=0

for pattern in "${PATTERNS[@]}"; do
  MATCHES=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.toml" --include="*.yaml" --include="*.yml" \
    -E "$pattern" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude="*.example" \
    --exclude="package-lock.json" \
    . 2>/dev/null || true)

  if [ -n "$MATCHES" ]; then
    echo "⚠️  Possible secret found matching: $pattern"
    echo "$MATCHES"
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo "❌ Secrets detected! Remove them before committing."
  exit 1
fi

echo "✅ No secrets found in codebase"
