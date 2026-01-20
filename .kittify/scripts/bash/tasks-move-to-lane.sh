#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Usage: tasks-move-to-lane.sh <feature-slug> <task-id> <lane> [--shell-pid PID] [--agent AGENT] [--note NOTE]

FEATURE_SLUG=""
TASK_ID=""
TARGET_LANE=""
SHELL_PID=""
AGENT="claude"
NOTE=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        --shell-pid) shift; SHELL_PID="$1" ;;
        --agent) shift; AGENT="$1" ;;
        --note) shift; NOTE="$1" ;;
        --help|-h)
            echo "Usage: $0 <feature-slug> <task-id> <lane> [--shell-pid PID] [--agent AGENT] [--note NOTE]"
            echo ""
            echo "Lanes: planned, doing, for_review, done"
            exit 0
            ;;
        *)
            if [ -z "$FEATURE_SLUG" ]; then
                FEATURE_SLUG="$1"
            elif [ -z "$TASK_ID" ]; then
                TASK_ID="$1"
            elif [ -z "$TARGET_LANE" ]; then
                TARGET_LANE="$1"
            fi
            ;;
    esac
    shift
done

# Validate inputs
if [ -z "$FEATURE_SLUG" ] || [ -z "$TASK_ID" ] || [ -z "$TARGET_LANE" ]; then
    echo "Error: Missing required arguments" >&2
    echo "Usage: $0 <feature-slug> <task-id> <lane>" >&2
    exit 1
fi

# Validate lane
case "$TARGET_LANE" in
    planned|doing|for_review|done) ;;
    *)
        echo "Error: Invalid lane '$TARGET_LANE'. Use: planned, doing, for_review, done" >&2
        exit 1
        ;;
esac

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
    echo "Error: Task $TASK_ID not found in $FEATURE_DIR/tasks/" >&2
    exit 1
fi

# Update the lane in frontmatter
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Update lane field
sed -i.bak "s/^lane: \".*\"/lane: \"$TARGET_LANE\"/" "$TASK_FILE"

# Update agent field if provided
if [ -n "$AGENT" ]; then
    sed -i.bak "s/^agent: \".*\"/agent: \"$AGENT\"/" "$TASK_FILE"
fi

# Update shell_pid field if provided
if [ -n "$SHELL_PID" ]; then
    sed -i.bak "s/^shell_pid: \".*\"/shell_pid: \"$SHELL_PID\"/" "$TASK_FILE"
fi

# Add history entry
HISTORY_ENTRY="  - timestamp: \"$TIMESTAMP\"\n    lane: \"$TARGET_LANE\"\n    agent: \"$AGENT\"\n    action: \"${NOTE:-Moved to $TARGET_LANE}\""

# Append to history (simplified - in production use proper YAML handling)
echo "" >> "$TASK_FILE"
echo "# Activity: $TIMESTAMP - $AGENT - Moved to $TARGET_LANE - ${NOTE:-}" >> "$TASK_FILE"

# Clean up backup
rm -f "$TASK_FILE.bak"

echo "[spec-kitty] ✓ Task $TASK_ID moved to $TARGET_LANE"
echo "File: $TASK_FILE"
