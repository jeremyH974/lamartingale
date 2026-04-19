#!/usr/bin/env bash
# Deploy helper : pour un podcast id donné, link, ajoute les env vars, deploy prod.
# Usage: bash scripts/deploy-orso.sh <podcast-id>
set -e
ID="$1"
PROJECT="${ID}-v2"
SCOPE="jeremyh974s-projects"
CFG="vercel-configs/vercel-${ID}.json"

echo "=== Deploy $ID -> $PROJECT ==="

DB=$(grep -E "^DATABASE_URL=" .env | sed 's/^DATABASE_URL=//')
OAI=$(grep -E "^OPENAI_API_KEY=" .env | sed 's/^OPENAI_API_KEY=//')
ANT=$(grep -E "^ANTHROPIC_API_KEY=" .env | sed 's/^ANTHROPIC_API_KEY=//')

rm -rf .vercel
vercel link --yes --scope "$SCOPE" --project "$PROJECT"

printf "%s" "$ID"  | vercel env add PODCAST_ID        production >/dev/null 2>&1 || echo "  PODCAST_ID deja present"
printf "%s" "$DB"  | vercel env add DATABASE_URL      production >/dev/null 2>&1 || echo "  DATABASE_URL deja present"
printf "%s" "$OAI" | vercel env add OPENAI_API_KEY    production >/dev/null 2>&1 || echo "  OPENAI_API_KEY deja present"
printf "%s" "$ANT" | vercel env add ANTHROPIC_API_KEY production >/dev/null 2>&1 || echo "  ANTHROPIC_API_KEY deja present"

vercel --yes --prod --scope "$SCOPE" --local-config "$CFG" 2>&1 | tail -3

echo "=== $ID deployed -> https://${PROJECT}.vercel.app ==="
