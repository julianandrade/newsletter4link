#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

INSTANCE_ID="$1"

if [ -z "$INSTANCE_ID" ]; then
    echo "Usage: $0 <instance-id>" >&2
    exit 1
fi

REPO_ROOT=$(get_repo_root)
INSTANCES_DIR="$REPO_ROOT/.kittify/.instances"
INSTANCE_FILE="$INSTANCES_DIR/$INSTANCE_ID.json"

if [ ! -f "$INSTANCE_FILE" ]; then
    echo "Error: Instance $INSTANCE_ID not found" >&2
    exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Update last_heartbeat
sed -i.bak "s/\"last_heartbeat\": \"[^\"]*\"/\"last_heartbeat\": \"$TIMESTAMP\"/" "$INSTANCE_FILE"
rm -f "$INSTANCE_FILE.bak"

echo "[spec-kitty] ✓ Heartbeat updated for $INSTANCE_ID"
