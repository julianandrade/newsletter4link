#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

JSON_MODE=false
FEATURE_SLUG=""
MODE="checklist"
ACTOR="claude"
TEST_COMMANDS=()

while [ "$#" -gt 0 ]; do
    case "$1" in
        --json) JSON_MODE=true ;;
        --feature) shift; FEATURE_SLUG="$1" ;;
        --mode) shift; MODE="$1" ;;
        --actor) shift; ACTOR="$1" ;;
        --test) shift; TEST_COMMANDS+=("$1") ;;
        --help|-h)
            echo "Usage: $0 [--json] [--feature <slug>] [--mode <pr|local|checklist>] [--actor <name>] [--test <cmd>]"
            exit 0
            ;;
    esac
    shift
done

REPO_ROOT=$(get_repo_root)
CURRENT_BRANCH=$(get_current_branch)

# Use current branch if no feature specified
[ -z "$FEATURE_SLUG" ] && FEATURE_SLUG="$CURRENT_BRANCH"

FEATURE_DIR=$(get_feature_dir "$REPO_ROOT" "$FEATURE_SLUG")

# Validate feature exists
if [ ! -d "$FEATURE_DIR" ]; then
    echo "Error: Feature $FEATURE_SLUG not found" >&2
    exit 1
fi

# Run acceptance checks
CHECKS_OK=true
OUTSTANDING=()

# Check spec.md exists
if [ ! -f "$FEATURE_DIR/spec.md" ]; then
    CHECKS_OK=false
    OUTSTANDING+=("Missing spec.md")
fi

# Check plan.md exists
if [ ! -f "$FEATURE_DIR/plan.md" ]; then
    CHECKS_OK=false
    OUTSTANDING+=("Missing plan.md")
fi

# Check tasks.md exists
if [ ! -f "$FEATURE_DIR/tasks.md" ]; then
    CHECKS_OK=false
    OUTSTANDING+=("Missing tasks.md")
fi

# Check all tasks are done
if [ -f "$FEATURE_DIR/tasks.md" ]; then
    INCOMPLETE=$(grep -c '\[ \]' "$FEATURE_DIR/tasks.md" || echo "0")
    if [ "$INCOMPLETE" -gt 0 ]; then
        CHECKS_OK=false
        OUTSTANDING+=("$INCOMPLETE incomplete tasks")
    fi
fi

# Check for NEEDS CLARIFICATION markers
CLARIFICATIONS=$(grep -r '\[NEEDS CLARIFICATION' "$FEATURE_DIR" 2>/dev/null | wc -l || echo "0")
if [ "$CLARIFICATIONS" -gt 0 ]; then
    CHECKS_OK=false
    OUTSTANDING+=("$CLARIFICATIONS clarification markers remaining")
fi

# Run test commands
for cmd in "${TEST_COMMANDS[@]}"; do
    if ! eval "$cmd" >/dev/null 2>&1; then
        CHECKS_OK=false
        OUTSTANDING+=("Test failed: $cmd")
    fi
done

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if $JSON_MODE; then
    OUTSTANDING_JSON=$(printf '%s\n' "${OUTSTANDING[@]}" | jq -R . | jq -s .)

    if [ "$CHECKS_OK" = true ]; then
        printf '{"summary":{"ok":true,"feature":"%s","actor":"%s","timestamp":"%s"},"instructions":"Ready to merge","outstanding":[]}\n' \
            "$FEATURE_SLUG" "$ACTOR" "$TIMESTAMP"
    else
        printf '{"summary":{"ok":false,"feature":"%s","actor":"%s","timestamp":"%s"},"outstanding":%s}\n' \
            "$FEATURE_SLUG" "$ACTOR" "$TIMESTAMP" "$OUTSTANDING_JSON"
    fi
else
    echo "Feature Acceptance: $FEATURE_SLUG"
    echo "========================="
    echo ""

    if [ "$CHECKS_OK" = true ]; then
        echo "✅ All checks passed!"
        echo ""
        echo "Ready to merge with /spec-kitty.merge"
    else
        echo "❌ Acceptance checks failed:"
        echo ""
        for issue in "${OUTSTANDING[@]}"; do
            echo "  - $issue"
        done
        echo ""
        echo "Fix these issues before acceptance"
    fi
fi
