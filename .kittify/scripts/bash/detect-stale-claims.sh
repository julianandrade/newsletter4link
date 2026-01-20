#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Detect stale task claims (instances that haven't updated heartbeat)
# Default timeout: 2 hours (7200 seconds)

TIMEOUT_SECONDS="${1:-7200}"

REPO_ROOT=$(get_repo_root)
INSTANCES_DIR="$REPO_ROOT/.kittify/.instances"

if [ ! -d "$INSTANCES_DIR" ]; then
    echo "No instances registered"
    exit 0
fi

NOW=$(date +%s)
STALE_COUNT=0

echo "Checking for stale instances (timeout: ${TIMEOUT_SECONDS}s)..."
echo ""

for f in "$INSTANCES_DIR"/*.json; do
    [ -f "$f" ] || continue

    INSTANCE_ID=$(basename "$f" .json)
    HEARTBEAT=$(grep -o '"last_heartbeat": "[^"]*"' "$f" | cut -d'"' -f4)

    # Convert ISO timestamp to epoch (simplified)
    HEARTBEAT_EPOCH=$(date -d "$HEARTBEAT" +%s 2>/dev/null || echo "0")

    if [ "$HEARTBEAT_EPOCH" != "0" ]; then
        AGE=$((NOW - HEARTBEAT_EPOCH))

        if [ "$AGE" -gt "$TIMEOUT_SECONDS" ]; then
            echo "STALE: $INSTANCE_ID (last heartbeat: ${AGE}s ago)"
            STALE_COUNT=$((STALE_COUNT + 1))

            # Mark as stale
            sed -i.bak 's/"status": "[^"]*"/"status": "stale"/' "$f"
            rm -f "$f.bak"
        fi
    fi
done

if [ "$STALE_COUNT" -eq 0 ]; then
    echo "No stale instances found"
else
    echo ""
    echo "Found $STALE_COUNT stale instance(s)"
    echo "Consider releasing their claimed tasks"
fi
