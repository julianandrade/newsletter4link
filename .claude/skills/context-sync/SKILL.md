# Context Sync Skill

## Purpose

Synchronize agent context files (CLAUDE.md) after major changes to keep AI agents informed of project state.

## Trigger

Run this skill:
- After completing a major feature
- When adding new technologies
- After significant architectural changes
- Before starting a new feature

## What Gets Updated

The sync updates `CLAUDE.md` with:
- Active technologies in use
- Recent changes and features
- Per-feature tech stacks
- Constitutional requirements

## Execution

```bash
.kittify/scripts/bash/update-agent-context.sh claude
```

## How It Works

1. **Scans project files** for technology markers:
   - Package.json dependencies
   - Import statements
   - Configuration files

2. **Extracts feature information** from:
   - kitty-specs/ directories
   - Recent git commits
   - Plan and spec files

3. **Updates context file** between markers:
   ```markdown
   <!-- TECH_STACK_START -->
   [Auto-generated content]
   <!-- TECH_STACK_END -->
   ```

## Manual Sections

Content outside the auto-generated markers is preserved:
- Custom guidelines
- Team conventions
- Project-specific rules

## Output Format

```
Context Sync Complete
=====================

Updated: CLAUDE.md
Timestamp: 2025-01-07T10:30:00Z

Technologies detected:
- React 18.2.0
- TypeScript 5.0
- PostgreSQL

Recent features:
- 001-user-auth (completed)
- 002-dashboard (in progress)

Changes made:
- Added React version
- Updated feature list
- Synced tech stack
```

## Integration

This skill integrates with:
- `/spec-kitty.merge` - Run after merging features
- `/agent.ops` - Part of ops workflow
- Session startup - Recommended to run at session start
