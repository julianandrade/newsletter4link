#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Claim a task for an instance (multi-agent coordination)
# Usage: claim-task.sh <feature-slug> <task-id> <instance-id>

FEATURE_SLUG="$1"
TASK_ID="$2"
INSTANCE_ID="$3"

if [ -z "$FEATURE_SLUG" ] || [ -z "$TASK_ID" ] || [ -z "$INSTANCE_ID" ]; then
    echo "Usage: $0 <feature-slug> <task-id> <instance-id>" >&2
    exit 1
fi

REPO_ROOT=$(get_repo_root)
FEATURE_DIR="$REPO_ROOT/kitty-specs/$FEATURE_SLUG"

# Find the task file
TASK_FILE=""
for f in "$FEATURE_DIR/tasks"/*.md; do
    [ -f "$f" ] || continue
    if grep -q "work_package_id: \"$TASK_ID\"" "$f" 2>/dev/null; then
        TASK_FILE="$f"
        break
    fi
done

if [ -z "$TASK_FILE" ]; then
    echo "Error: Task $TASK_ID not found" >&2
    exit 1
fi

# Check if task is already claimed
CURRENT_ASSIGNEE=$(grep -o 'assignee: "[^"]*"' "$TASK_FILE" | cut -d'"' -f2)

if [ -n "$CURRENT_ASSIGNEE" ] && [ "$CURRENT_ASSIGNEE" != "$INSTANCE_ID" ]; then
    echo "Error: Task $TASK_ID already claimed by $CURRENT_ASSIGNEE" >&2
    exit 1
fi

# Claim the task
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
sed -i.bak "s/^assignee: \".*\"/assignee: \"$INSTANCE_ID\"/" "$TASK_FILE"
rm -f "$TASK_FILE.bak"

echo "[spec-kitty] ✓ Task $TASK_ID claimed by $INSTANCE_ID"
