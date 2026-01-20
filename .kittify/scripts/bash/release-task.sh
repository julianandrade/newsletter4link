#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Release a claimed task
FEATURE_SLUG="$1"
TASK_ID="$2"

if [ -z "$FEATURE_SLUG" ] || [ -z "$TASK_ID" ]; then
    echo "Usage: $0 <feature-slug> <task-id>" >&2
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

# Release the task
sed -i.bak 's/^assignee: "[^"]*"/assignee: ""/' "$TASK_FILE"
rm -f "$TASK_FILE.bak"

echo "[spec-kitty] ✓ Task $TASK_ID released"
