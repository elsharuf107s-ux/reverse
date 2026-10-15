#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
mkdir -p analysis-output
if pgrep -f "node server.mjs" >/dev/null 2>&1; then
  exit 0
fi
nohup npm run ui > analysis-output/ui.log 2>&1 &
echo $! > analysis-output/ui.pid
