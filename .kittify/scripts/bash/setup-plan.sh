#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

JSON_MODE=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        --json) JSON_MODE=true ;;
        --help|-h)
            echo "Usage: $0 [--json]"
            exit 0
            ;;
    esac
    shift
done

REPO_ROOT=$(get_repo_root)
CURRENT_BRANCH=$(get_current_branch)

# Validate we're on a feature branch
if ! check_feature_branch "$CURRENT_BRANCH"; then
    exit 1
fi

FEATURE_DIR=$(get_feature_dir "$REPO_ROOT" "$CURRENT_BRANCH")
SPEC_FILE="$FEATURE_DIR/spec.md"
PLAN_FILE="$FEATURE_DIR/plan.md"

# Check spec.md exists
if [ ! -f "$SPEC_FILE" ]; then
    echo "[spec-kitty] Error: spec.md not found at $SPEC_FILE" >&2
    echo "[spec-kitty] Run /spec-kitty.specify first" >&2
    exit 1
fi

# Copy plan template if plan.md doesn't exist
if [ ! -f "$PLAN_FILE" ]; then
    TEMPLATE="$REPO_ROOT/.kittify/missions/software-dev/templates/plan-template.md"
    if [ -f "$TEMPLATE" ]; then
        cp "$TEMPLATE" "$PLAN_FILE"
        echo "[spec-kitty] Created plan.md from template" >&2
    else
        touch "$PLAN_FILE"
    fi
fi

if $JSON_MODE; then
    printf '{"FEATURE_SPEC":"%s","IMPL_PLAN":"%s","SPECS_DIR":"%s","BRANCH":"%s"}\n' \
        "$SPEC_FILE" "$PLAN_FILE" "$FEATURE_DIR" "$CURRENT_BRANCH"
else
    echo "FEATURE_SPEC: $SPEC_FILE"
    echo "IMPL_PLAN: $PLAN_FILE"
    echo "SPECS_DIR: $FEATURE_DIR"
    echo "BRANCH: $CURRENT_BRANCH"
fi
