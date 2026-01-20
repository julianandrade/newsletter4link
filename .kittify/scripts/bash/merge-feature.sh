#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

STRATEGY="merge"
TARGET="main"
PUSH=false
KEEP_BRANCH=false
KEEP_WORKTREE=false
DRY_RUN=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        --strategy) shift; STRATEGY="$1" ;;
        --target) shift; TARGET="$1" ;;
        --push) PUSH=true ;;
        --keep-branch) KEEP_BRANCH=true ;;
        --keep-worktree) KEEP_WORKTREE=true ;;
        --dry-run) DRY_RUN=true ;;
        --help|-h)
            echo "Usage: $0 [--strategy <merge|squash>] [--target <branch>] [--push] [--keep-branch] [--keep-worktree] [--dry-run]"
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

echo "Merge Feature: $CURRENT_BRANCH"
echo "========================="
echo ""
echo "Strategy: $STRATEGY"
echo "Target: $TARGET"
echo "Push: $PUSH"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would perform the following:"
    echo "  1. Switch to $TARGET"
    echo "  2. Pull latest changes"
    echo "  3. Merge $CURRENT_BRANCH with strategy: $STRATEGY"
    [ "$PUSH" = true ] && echo "  4. Push to origin"
    [ "$KEEP_WORKTREE" = false ] && echo "  5. Remove worktree"
    [ "$KEEP_BRANCH" = false ] && echo "  6. Delete feature branch"
    exit 0
fi

# Check for uncommitted changes
if ! git diff --quiet 2>/dev/null; then
    echo "Error: Working directory has uncommitted changes" >&2
    exit 1
fi

# Find primary repo root (for worktrees)
if [[ "$REPO_ROOT" == *".worktrees"* ]]; then
    PRIMARY_ROOT=$(dirname "$(dirname "$REPO_ROOT")")
else
    PRIMARY_ROOT="$REPO_ROOT"
fi

# Switch to primary repo and target branch
cd "$PRIMARY_ROOT"
git checkout "$TARGET"
git pull --ff-only origin "$TARGET" 2>/dev/null || true

# Perform merge
case "$STRATEGY" in
    merge)
        git merge "$CURRENT_BRANCH" -m "Merge feature: $CURRENT_BRANCH"
        ;;
    squash)
        git merge --squash "$CURRENT_BRANCH"
        git commit -m "Feature: $CURRENT_BRANCH (squashed)"
        ;;
    *)
        echo "Error: Unknown strategy $STRATEGY" >&2
        exit 1
        ;;
esac

echo "✅ Merged $CURRENT_BRANCH into $TARGET"

# Push if requested
if [ "$PUSH" = true ]; then
    git push origin "$TARGET"
    echo "✅ Pushed to origin/$TARGET"
fi

# Cleanup worktree
if [ "$KEEP_WORKTREE" = false ] && [[ "$REPO_ROOT" == *".worktrees"* ]]; then
    git worktree remove "$REPO_ROOT" 2>/dev/null || true
    echo "✅ Removed worktree"
fi

# Cleanup branch
if [ "$KEEP_BRANCH" = false ]; then
    git branch -d "$CURRENT_BRANCH" 2>/dev/null || true
    echo "✅ Deleted feature branch"
fi

echo ""
echo "🎉 Feature merged successfully!"
