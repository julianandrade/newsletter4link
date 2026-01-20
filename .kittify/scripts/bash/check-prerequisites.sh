#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

JSON_MODE=false
INCLUDE_TASKS=false
REQUIRE_TASKS=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        --json) JSON_MODE=true ;;
        --include-tasks) INCLUDE_TASKS=true ;;
        --require-tasks) REQUIRE_TASKS=true; INCLUDE_TASKS=true ;;
        --help|-h)
            echo "Usage: $0 [--json] [--include-tasks] [--require-tasks]"
            exit 0
            ;;
    esac
    shift
done

REPO_ROOT=$(get_repo_root)
CURRENT_BRANCH=$(get_current_branch)
FEATURE_DIR=$(get_feature_dir "$REPO_ROOT" "$CURRENT_BRANCH")

# Check required files
AVAILABLE_DOCS=()

check_doc() {
    local path="$1"
    local name="$2"
    if [ -f "$path" ]; then
        AVAILABLE_DOCS+=("$name")
        return 0
    fi
    return 1
}

check_doc "$FEATURE_DIR/spec.md" "spec.md"
check_doc "$FEATURE_DIR/plan.md" "plan.md"
check_doc "$FEATURE_DIR/tasks.md" "tasks.md"
check_doc "$FEATURE_DIR/research.md" "research.md"
check_doc "$FEATURE_DIR/data-model.md" "data-model.md"
[ -d "$FEATURE_DIR/contracts" ] && AVAILABLE_DOCS+=("contracts/")
[ -d "$FEATURE_DIR/checklists" ] && AVAILABLE_DOCS+=("checklists/")

# Check if tasks.md is required
if [ "$REQUIRE_TASKS" = true ] && [ ! -f "$FEATURE_DIR/tasks.md" ]; then
    echo "[spec-kitty] Error: tasks.md not found. Run /spec-kitty.tasks first." >&2
    exit 1
fi

if $JSON_MODE; then
    DOCS_JSON=$(printf '%s\n' "${AVAILABLE_DOCS[@]}" | jq -R . | jq -s .)
    printf '{"FEATURE_DIR":"%s","BRANCH":"%s","AVAILABLE_DOCS":%s}\n' \
        "$FEATURE_DIR" "$CURRENT_BRANCH" "$DOCS_JSON"
else
    echo "FEATURE_DIR: $FEATURE_DIR"
    echo "BRANCH: $CURRENT_BRANCH"
    echo "AVAILABLE_DOCS:"
    for doc in "${AVAILABLE_DOCS[@]}"; do
        echo "  - $doc"
    done
fi
