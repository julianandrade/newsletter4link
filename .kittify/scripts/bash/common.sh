#!/usr/bin/env bash
# Common functions and variables for all scripts

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_USAGE_ERROR=1
readonly EXIT_VALIDATION_ERROR=2
readonly EXIT_EXECUTION_ERROR=3
readonly EXIT_PRECONDITION_ERROR=4

# Get repository root
get_repo_root() {
    if git rev-parse --show-toplevel >/dev/null 2>&1; then
        git rev-parse --show-toplevel
    else
        local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        (cd "$script_dir/../../.." && pwd)
    fi
}

# Get current branch
get_current_branch() {
    if [[ -n "${SPECIFY_FEATURE:-}" ]]; then
        echo "$SPECIFY_FEATURE"
        return
    fi

    if git rev-parse --abbrev-ref HEAD >/dev/null 2>&1; then
        git rev-parse --abbrev-ref HEAD
        return
    fi

    echo "main"
}

# Check if we have git available
has_git() {
    git rev-parse --show-toplevel >/dev/null 2>&1
}

# Check if on a feature branch
check_feature_branch() {
    local branch="$1"

    if [[ ! "$branch" =~ ^[0-9]{3}- ]]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "❌ ERROR: Command run from wrong location!" >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "" >&2
        echo "Current branch: $branch" >&2
        echo "Required: Feature branch (e.g., 001-feature-name)" >&2
        return 1
    fi
    return 0
}

# Get feature directory
get_feature_dir() {
    echo "$1/kitty-specs/$2"
}

# Log to stderr
show_log() {
    echo "[spec-kitty] $1" >&2
}

# Validate feature exists
validate_feature_exists() {
    local feature_slug="$1"
    local repo_root="${2:-$(get_repo_root)}"

    if [[ -z "$feature_slug" ]]; then
        show_log "❌ ERROR: Feature slug is required"
        return $EXIT_VALIDATION_ERROR
    fi

    local feature_dir="$repo_root/kitty-specs/$feature_slug"
    local worktree_dir="$repo_root/.worktrees/$feature_slug"

    if [[ ! -d "$feature_dir" ]] && [[ ! -d "$worktree_dir" ]]; then
        show_log "❌ ERROR: Feature '$feature_slug' not found"
        return $EXIT_VALIDATION_ERROR
    fi

    return $EXIT_SUCCESS
}

# Slugify a string
slugify() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+/-/g' | sed 's/^-//' | sed 's/-$//'
}

# Trim whitespace
trim() {
    local trimmed="$1"
    trimmed="${trimmed#"${trimmed%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    echo "$trimmed"
}

# JSON escape
json_escape() {
    local str="$1"
    str=${str//\\/\\\\}
    str=${str//\"/\\\"}
    str=${str//$'\n'/\\n}
    str=${str//$'\r'/\\r}
    echo "$str"
}

# Common flags handling
DRY_RUN=false
JSON_OUTPUT=false
QUIET_MODE=false
SHOW_HELP=false
declare -a REMAINING_ARGS=()

handle_common_flags() {
    REMAINING_ARGS=()

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help|-h) SHOW_HELP=true; shift ;;
            --dry-run) DRY_RUN=true; shift ;;
            --json) JSON_OUTPUT=true; shift ;;
            --quiet|-q) QUIET_MODE=true; shift ;;
            --) shift; REMAINING_ARGS+=("$@"); break ;;
            -*) show_log "Unknown option: $1"; return $EXIT_USAGE_ERROR ;;
            *) REMAINING_ARGS+=("$1"); shift ;;
        esac
    done

    return $EXIT_SUCCESS
}

# Execute with dry-run support
exec_cmd() {
    if [[ "$DRY_RUN" == true ]]; then
        show_log "[DRY RUN] Would execute: $@"
        return $EXIT_SUCCESS
    fi

    "$@" || return $EXIT_EXECUTION_ERROR
    return $EXIT_SUCCESS
}
