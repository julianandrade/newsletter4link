#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Update agent context file (CLAUDE.md) with current project state

AGENT="${1:-claude}"
REPO_ROOT=$(get_repo_root)

CONTEXT_FILE="$REPO_ROOT/CLAUDE.md"

if [ ! -f "$CONTEXT_FILE" ]; then
    echo "[spec-kitty] Warning: $CONTEXT_FILE not found" >&2
    exit 0
fi

echo "[spec-kitty] Updating agent context..."

# Get current features
FEATURES=""
if [ -d "$REPO_ROOT/kitty-specs" ]; then
    for dir in "$REPO_ROOT/kitty-specs"/*/; do
        [ -d "$dir" ] || continue
        FEATURE=$(basename "$dir")
        STATUS="unknown"

        if [ -f "$dir/tasks.md" ]; then
            INCOMPLETE=$(grep -c '\[ \]' "$dir/tasks.md" || echo "0")
            if [ "$INCOMPLETE" -eq 0 ]; then
                STATUS="completed"
            else
                STATUS="in_progress"
            fi
        elif [ -f "$dir/plan.md" ]; then
            STATUS="planned"
        elif [ -f "$dir/spec.md" ]; then
            STATUS="specified"
        fi

        FEATURES="$FEATURES\n- $FEATURE ($STATUS)"
    done
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo ""
echo "Context updated at: $TIMESTAMP"
echo ""
echo "Active Features:$FEATURES"
echo ""

echo "[spec-kitty] ✓ Agent context updated"
