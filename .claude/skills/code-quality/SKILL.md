# Code Quality Skill

## Purpose

Automatically run code quality checks (lint, format, test) and enforce quality gates before commits.

## Trigger

Run this skill:
- Before committing code
- When quality issues are suspected
- During code review

## Quality Gates

| Check | Command | Threshold |
|-------|---------|-----------|
| Lint | `<!-- LINT_COMMAND -->` | Max 20 warnings, 0 errors |
| Format | `<!-- FORMAT_COMMAND -->` | All files must pass |
| Tests | `<!-- TEST_COMMAND -->` | All tests must pass |

## Execution

```bash
# Run all quality checks
echo "Running lint..."
<!-- LINT_COMMAND -->

echo "Running format check..."
<!-- FORMAT_COMMAND -->

echo "Running tests..."
<!-- TEST_COMMAND -->
```

## Auto-Fix

If issues are found, offer to auto-fix:

```bash
# Auto-fix lint issues
<!-- LINT_FIX_COMMAND -->

# Auto-fix formatting
<!-- FORMAT_FIX_COMMAND -->
```

## Output Format

```
Code Quality Check Results
==========================

Lint:    ✅ PASS (2 warnings)
Format:  ❌ FAIL (3 files need formatting)
Tests:   ✅ PASS (42 tests, 100% pass)

Overall: FAIL - 1 check failed

Auto-fix available:
- Run `<!-- FORMAT_FIX_COMMAND -->` to fix formatting
```

## Configuration

Customize commands in `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(<!-- LINT_COMMAND -->)",
      "Bash(<!-- FORMAT_COMMAND -->)",
      "Bash(<!-- TEST_COMMAND -->)"
    ]
  }
}
```

## Integration

This skill integrates with:
- `/spec-kitty.implement` - Run before marking tasks complete
- `/spec-kitty.review` - Verify quality during review
- `/spec-kitty.accept` - Gate before acceptance
