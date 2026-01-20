#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Multi-instance coordination: Register this Claude instance
# This prevents multiple agents from working on the same task

INSTANCE_ID="${1:-$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "instance-$$")}"
AGENT_NAME="${2:-claude}"

REPO_ROOT=$(get_repo_root)
INSTANCES_DIR="$REPO_ROOT/.kittify/.instances"

mkdir -p "$INSTANCES_DIR"

INSTANCE_FILE="$INSTANCES_DIR/$INSTANCE_ID.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$INSTANCE_FILE" <<EOF
{
  "instance_id": "$INSTANCE_ID",
  "agent": "$AGENT_NAME",
  "registered_at": "$TIMESTAMP",
  "last_heartbeat": "$TIMESTAMP",
  "pid": $$,
  "status": "active"
}
EOF

echo "[spec-kitty] ✓ Instance registered: $INSTANCE_ID"
echo "Instance file: $INSTANCE_FILE"
echo ""
echo "Update heartbeat with: $0 --heartbeat $INSTANCE_ID"
