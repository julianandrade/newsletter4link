---
description: Validate feature readiness and guide final acceptance steps.
---

**Path reference rule:** Provide absolute paths or paths relative to project root.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Discovery (mandatory)

Before running the acceptance workflow, gather:

1. **Feature slug** (e.g., `005-awesome-thing`). If omitted, detect automatically.
2. **Acceptance mode**:
   - `pr` - merge via pull request
   - `local` - merge locally without PR
   - `checklist` - run readiness checklist only
3. **Validation commands** (tests/builds executed)
4. **Acceptance actor** (defaults to current agent)

Ask one focused question per item. End with `WAITING_FOR_ACCEPTANCE_INPUT` until all answers provided.

## Execution Plan

1. **Compile options**:
   - Always include `--actor "claude"`
   - Append `--feature "<slug>"` if provided
   - Append `--mode <mode>`
   - Append `--test "<command>"` for each validation command

2. **Run acceptance script**:
   ```bash
   .kittify/scripts/bash/accept-feature.sh --json $ARGUMENTS
   ```

3. **Parse JSON response** containing:
   - `summary.ok` (boolean)
   - `summary.outstanding` (issues if any)
   - `instructions` (merge steps)
   - `cleanup_instructions`

4. **Present outcome**:
   - If `summary.ok` is `false`: List outstanding issues
   - If `summary.ok` is `true`: Display acceptance info and merge instructions

5. For `checklist` mode: No commits or merge instructions produced

## Output Requirements

- Use plain text (no tables)
- Surface outstanding issues before success messages
- Never fabricate results

## Error Handling

- If command fails, report failure and request user guidance
- When issues exist, do NOT force acceptance

**Next suggested command**: `/spec-kitty.merge`
