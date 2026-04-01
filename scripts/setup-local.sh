#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DEV_VARS="$ROOT_DIR/.dev.vars"
WRANGLER_CONFIG="$ROOT_DIR/wrangler.jsonc"

# Strip JSONC comments and extract secrets.required array
secrets=$(sed 's|//.*||' "$WRANGLER_CONFIG" | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); \
  (d.secrets?.required||[]).forEach(s=>console.log(s))")

if [ -z "$secrets" ]; then
  echo "No required secrets found in wrangler.jsonc"
  exit 0
fi

# Load existing values if .dev.vars exists
declare -A existing=()
if [ -f "$DEV_VARS" ]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    existing["$key"]="$value"
  done < "$DEV_VARS"
fi

echo "Setting up .dev.vars from wrangler.jsonc secrets.required"
echo "Press Enter to keep existing value, or type a new one."
echo

entries=()
while IFS= read -r name; do
  current="${existing[$name]:-}"
  if [ -n "$current" ]; then
    # Truncate display for long values
    display="$current"
    if [ ${#display} -gt 60 ]; then
      display="${display:0:57}..."
    fi
    read -rp "$name [$display]: " input
    entries+=("$name=${input:-$current}")
  else
    read -rp "$name: " input
    entries+=("$name=$input")
  fi
done <<< "$secrets"

printf '%s\n' "${entries[@]}" > "$DEV_VARS"
echo
echo "Wrote $DEV_VARS with ${#entries[@]} secrets."
