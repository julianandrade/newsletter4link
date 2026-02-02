# Agent Policy (Claude + Codex)

This policy aligns behavior across agents using this repo.

Claude-specific tooling and hooks live in `.claude/settings.local.json`. Keep Codex behavior aligned with those safeguards.

## Safety Rules

- Do not edit `.env`, `.env.*`, or files containing credentials/secrets.
- Do not run destructive commands (e.g., `rm -rf /`, `git push --force`, `DROP TABLE`, `TRUNCATE`).
- Do not create or modify git worktrees unless explicitly requested.
- Avoid forceful history edits unless explicitly requested.

## Change Discipline

- Keep diffs scoped; avoid unrelated formatting changes.
- Prefer small commits with clear messages.
- Run relevant tests before reporting completion.

## Optional Local Hook

To enable a simple pre-commit safety hook:

```bash
git config core.hooksPath scripts/hooks
```

This hook blocks staging of `.env`-like files and rejects commits containing obvious destructive SQL.
