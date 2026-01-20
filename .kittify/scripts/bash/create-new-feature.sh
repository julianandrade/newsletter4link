#!/usr/bin/env bash
set -e

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

JSON_MODE=false
FEATURE_NAME=""
ARGS=()

while [ "$#" -gt 0 ]; do
    case "$1" in
        --json) JSON_MODE=true ;;
        --feature-name=*) FEATURE_NAME="${1#*=}" ;;
        --feature-name) shift; FEATURE_NAME="$1" ;;
        --help|-h)
            echo "Usage: $0 [--json] [--feature-name \"Title\"] <feature_description>"
            exit 0
            ;;
        *) ARGS+=("$1") ;;
    esac
    shift
done

FEATURE_DESCRIPTION="${ARGS[*]}"
if [ -z "$FEATURE_DESCRIPTION" ]; then
    echo "[spec-kitty] Error: Feature description missing." >&2
    exit 1
fi

REPO_ROOT=$(get_repo_root)
HAS_GIT=$(has_git && echo "true" || echo "false")

# Find highest feature number
SPECS_DIR_BASE="$REPO_ROOT/kitty-specs"
WORKTREES_DIR="$REPO_ROOT/.worktrees"
HIGHEST=0

if [ -d "$SPECS_DIR_BASE" ]; then
    for dir in "$SPECS_DIR_BASE"/*; do
        [ -d "$dir" ] || continue
        number=$(basename "$dir" | grep -o '^[0-9]\+' || echo "0")
        number=$((10#$number))
        [ "$number" -gt "$HIGHEST" ] && HIGHEST=$number
    done
fi

if [ -d "$WORKTREES_DIR" ]; then
    for dir in "$WORKTREES_DIR"/*; do
        [ -d "$dir" ] || continue
        number=$(basename "$dir" | grep -o '^[0-9]\+' || echo "0")
        number=$((10#$number))
        [ "$number" -gt "$HIGHEST" ] && HIGHEST=$number
    done
fi

NEXT=$((HIGHEST + 1))
FEATURE_NUM=$(printf "%03d" "$NEXT")

FRIENDLY_NAME="$(trim "${FEATURE_NAME:-$FEATURE_DESCRIPTION}")"
SLUG_SOURCE=$(slugify "$FRIENDLY_NAME")
WORDS=$(echo "$SLUG_SOURCE" | tr '-' '\n' | grep -v '^$' | head -3 | tr '\n' '-' | sed 's/-$//')
[ -z "$WORDS" ] && WORDS="feature"

BRANCH_NAME="${FEATURE_NUM}-${WORDS}"
TARGET_ROOT="$REPO_ROOT"
WORKTREE_NOTE=""
WORKTREE_CREATED=false

# Create worktree if git is available
if [ "$HAS_GIT" = "true" ]; then
    WORKTREE_ROOT="$REPO_ROOT/.worktrees"
    WORKTREE_PATH="$WORKTREE_ROOT/$BRANCH_NAME"
    mkdir -p "$WORKTREE_ROOT"

    if [ ! -d "$WORKTREE_PATH" ]; then
        if git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" >/dev/null 2>&1; then
            TARGET_ROOT="$WORKTREE_PATH"
            WORKTREE_CREATED=true
            WORKTREE_NOTE="$WORKTREE_PATH"
        fi
    fi
fi

cd "$TARGET_ROOT"
REPO_ROOT="$TARGET_ROOT"

# Create feature directory
SPECS_DIR="$REPO_ROOT/kitty-specs"
mkdir -p "$SPECS_DIR"

FEATURE_DIR="$SPECS_DIR/$BRANCH_NAME"
mkdir -p "$FEATURE_DIR"

# Create tasks directory
TASKS_DIR="$FEATURE_DIR/tasks"
mkdir -p "$TASKS_DIR"
touch "$TASKS_DIR/.gitkeep"

# Create spec file from template
SPEC_FILE="$FEATURE_DIR/spec.md"
TEMPLATE="$REPO_ROOT/.kittify/missions/software-dev/templates/spec-template.md"
if [ -f "$TEMPLATE" ]; then
    cp "$TEMPLATE" "$SPEC_FILE"
else
    touch "$SPEC_FILE"
fi

# Create meta.json
META_FILE="$FEATURE_DIR/meta.json"
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > "$META_FILE" <<EOF
{
  "feature_number": "$FEATURE_NUM",
  "slug": "$BRANCH_NAME",
  "friendly_name": "$(json_escape "$FRIENDLY_NAME")",
  "source_description": "$(json_escape "$FEATURE_DESCRIPTION")",
  "created_at": "$timestamp"
}
EOF

# Output
if $JSON_MODE; then
    printf '{"BRANCH_NAME":"%s","SPEC_FILE":"%s","FEATURE_NUM":"%s","FRIENDLY_NAME":"%s","WORKTREE_PATH":"%s"}\n' \
        "$BRANCH_NAME" "$SPEC_FILE" "$FEATURE_NUM" "$(json_escape "$FRIENDLY_NAME")" "$(json_escape "$WORKTREE_NOTE")"
else
    echo "BRANCH_NAME: $BRANCH_NAME"
    echo "SPEC_FILE: $SPEC_FILE"
    echo "FEATURE_NUM: $FEATURE_NUM"
    echo "FRIENDLY_NAME: $FRIENDLY_NAME"

    if [ -n "$WORKTREE_NOTE" ]; then
        echo ""
        echo "✓ Git worktree created at: $WORKTREE_NOTE"
        echo ""
        echo "NEXT STEP: cd \"$WORKTREE_NOTE\""
    fi
fi
