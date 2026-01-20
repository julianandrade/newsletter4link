#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

REPO_ROOT=$(get_repo_root)
INSTANCES_DIR="$REPO_ROOT/.kittify/.instances"

if [ ! -d "$INSTANCES_DIR" ]; then
    echo "No instances registered"
    exit 0
fi

echo "Registered Instances:"
echo "====================="

for f in "$INSTANCES_DIR"/*.json; do
    [ -f "$f" ] || continue

    INSTANCE_ID=$(basename "$f" .json)
    AGENT=$(grep -o '"agent": "[^"]*"' "$f" | cut -d'"' -f4)
    REGISTERED=$(grep -o '"registered_at": "[^"]*"' "$f" | cut -d'"' -f4)
    HEARTBEAT=$(grep -o '"last_heartbeat": "[^"]*"' "$f" | cut -d'"' -f4)
    STATUS=$(grep -o '"status": "[^"]*"' "$f" | cut -d'"' -f4)

    echo ""
    echo "Instance: $INSTANCE_ID"
    echo "  Agent: $AGENT"
    echo "  Status: $STATUS"
    echo "  Registered: $REGISTERED"
    echo "  Last Heartbeat: $HEARTBEAT"
done
