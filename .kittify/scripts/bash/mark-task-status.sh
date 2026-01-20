#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

TASK_ID=""
STATUS=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        --task-id) shift; TASK_ID="$1" ;;
        --status) shift; STATUS="$1" ;;
        --help|-h)
            echo "Usage: $0 --task-id <id> --status <done|pending>"
            exit 0
            ;;
    esac
    shift
done

if [ -z "$TASK_ID" ] || [ -z "$STATUS" ]; then
    echo "Error: --task-id and --status are required" >&2
    exit 1
fi

REPO_ROOT=$(get_repo_root)
CURRENT_BRANCH=$(get_current_branch)
FEATURE_DIR=$(get_feature_dir "$REPO_ROOT" "$CURRENT_BRANCH")
TASKS_FILE="$FEATURE_DIR/tasks.md"

if [ ! -f "$TASKS_FILE" ]; then
    echo "Error: tasks.md not found at $TASKS_FILE" >&2
    exit 1
fi

# Mark task as complete or pending in tasks.md
if [ "$STATUS" = "done" ]; then
    # Change [ ] to [x] for the task
    sed -i.bak "s/\[ \] $TASK_ID:/[x] $TASK_ID:/" "$TASKS_FILE"
    echo "[spec-kitty] ✓ Task $TASK_ID marked as done"
else
    # Change [x] to [ ] for the task
    sed -i.bak "s/\[x\] $TASK_ID:/[ ] $TASK_ID:/" "$TASKS_FILE"
    echo "[spec-kitty] ✓ Task $TASK_ID marked as pending"
fi

rm -f "$TASKS_FILE.bak"
