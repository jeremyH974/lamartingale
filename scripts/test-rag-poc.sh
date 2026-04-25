#!/usr/bin/env bash
# POC Chantier 6 — test 3 queries RAG sur LM local.
# Run :
#   PODCAST_ID=lamartingale PORT=3001 npx tsx engine/api.ts &
#   bash scripts/_chantier6-test-rag.sh
set -e
URL="${RAG_URL:-http://localhost:3001/api/knowledge/query}"

QUERIES=(
  "Quels invités de La Martingale ont parlé du PER ?"
  "Quelles sont les meilleures stratégies d'investissement long terme évoquées dans le podcast ?"
  "Y a-t-il des invités qui ont parlé d'investissement en SCPI ?"
)

for i in "${!QUERIES[@]}"; do
  Q="${QUERIES[$i]}"
  echo ""
  echo "============================================================"
  echo "Q$((i+1)) : $Q"
  echo "============================================================"
  RESP=$(curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -d "$(printf '{"question":%s}' "$(printf '%s' "$Q" | python -c 'import json,sys;print(json.dumps(sys.stdin.read()))')")")
  echo "$RESP" | python -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    print('PARSE FAIL:', e)
    sys.exit(0)
if 'error' in d:
    print('ERROR:', d['error']); sys.exit(0)
print('--- ANSWER ---')
print(d.get('answer','(empty)'))
print('')
print('--- SOURCES (' + str(d.get('meta',{}).get('sources_count',0)) + ') ---')
for s in d.get('sources', []):
    print(f\"  #{s['episode_number']} (id={s['episode_id']}) — {s['title']}\")
    print(f\"    url     : {s.get('url','')}\")
    print(f\"    excerpt : {s.get('excerpt','')[:200]}…\")
print('')
print(f\"--- META --- model={d['meta']['model']} timing_ms={d['meta']['timing_ms']}\")
"
done
echo ""
echo "Done."
