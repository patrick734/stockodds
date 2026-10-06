#!/usr/bin/env bash
# Reads the live TWAP pools exactly as the StockOdds game will, for the last few hours, and prints each hour's
# moves and the chain's answers. Read-only: sends nothing, needs no key. Run it before deploying.
set -euo pipefail
cd "$(dirname "$0")"
[[ -d contracts/node_modules ]] || (cd contracts && npm ci --no-audit --no-fund)
eval "$(node tools/env.js)"
cd contracts
node scripts/probe.js
