#!/usr/bin/env bash
# update-model-pricing.sh
#
# Fetches model data from the OpenRouter public API and generates
# model_prices.json, which the app loads at startup to display
# accurate context windows and pricing.
#
# Usage:  ./Scripts/update-model-pricing.sh
#         (run from the prototype/MathMate directory)

set -euo pipefail

cd "$(dirname "$0")/.."

OUTPUT_DIR="Sources/MathMate/Resources"
OUTPUT_FILE="$OUTPUT_DIR/model_prices.json"
mkdir -p "$OUTPUT_DIR"

echo "Fetching model list from OpenRouter API..."
JSON=$(curl -s --max-time 30 "https://openrouter.ai/api/v1/models")

# Parse and transform with Python
python3 -c "
import json, sys

data = json.loads(sys.stdin.read())
models = data.get('data', data if isinstance(data, list) else [])

entries = {}
for m in models:
    mid = m.get('id')
    if not mid:
        continue

    # Pricing from OpenRouter is per-token; convert to \$/1M tokens
    pricing = m.get('pricing', {})
    try:
        prompt_per_token = float(pricing.get('prompt', 0))
        completion_per_token = float(pricing.get('completion', 0))
    except (ValueError, TypeError):
        continue

    prompt_per_m = round(prompt_per_token * 1_000_000, 2)
    completion_per_m = round(completion_per_token * 1_000_000, 2)

    ctx = m.get('context_length', 128000) or 128000

    entries[mid] = {
        'input': prompt_per_m,
        'output': completion_per_m,
        'contextWindow': ctx
    }

output = {'models': entries, '_meta': {'source': 'openrouter', 'count': len(entries)}}
print(json.dumps(output, indent=2))
" <<< "$JSON" > "$OUTPUT_FILE"

COUNT=$(python3 -c "import json; d=json.load(open('$OUTPUT_FILE')); print(d['_meta']['count'])")
echo "Wrote $COUNT models to $OUTPUT_FILE"
