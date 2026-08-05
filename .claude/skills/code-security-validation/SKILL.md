---
name: code-security-validation
description: Run code security checks (static-analysis-enforcer, code-security-auditor). Produce Security Findings Report when Critical/High. Use when executing step 7c in frontend-development or backend-development, or when asked to security audit code. Skip if features.security is false in settings.json.
preferred_agent: code-security-auditor
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Code Security Validation

Use this skill when you need to **validate feature code for security**: static analysis and manual-assisted review. This corresponds to **step 7c** in **`/frontend-development`** or **`/backend-development`**, inside each track’s validation loop (**frontend**: **7a** ↔ **7a2** ↔ **7b** ↔ **7c**; **backend**: **7a** ↔ **7a2** ↔ **7c** — no **7b**). **Skip** when `features.security` is `false` in `settings.json`.

## Where Used

- **frontend-development** / **backend-development**: step **7c** — Code security (static-analysis-enforcer, code-security-auditor)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id and changed files/branch. Prefer launching **static-analysis-enforcer** then **code-security-auditor** (`.claude/agents/security/code/`). If unavailable, main agent executes the procedure. |
| **In flow** | Step 7c invokes static-analysis-enforcer and code-security-auditor; agents follow this skill. |

## Purpose

- **Static analysis**: Security-focused rules (sanitization, sensitive APIs, secure patterns).
- **Code review**: Manual-assisted review for vulnerabilities (injection, XSS, deserialization, crypto, sensitive flows).
- **Report Critical/High**: Produce Security Findings Report; re-invoke developer; re-run loop.
- **Contextual agents**: When scope justifies (auth, IaC, runtime).

## When to Use

- Executing **step 7c** in **frontend-development** (after **7b** when tests enabled) or **backend-development** (after **7a2** when tests enabled).
- When asked to security audit code, run static analysis, or review for vulnerabilities.

## Inputs

- **Feature code**: Changed files/branch from Developer.
- **Tech-spec**: For context on sensitive endpoints/data.
- **Transaction folder**: For report paths.

## Process

1. **static-analysis-enforcer** (`.claude/agents/security/code/static-analysis-enforcer.md`): Apply security-focused static analysis rules. Validate sanitization, sensitive APIs, secure patterns.
2. **code-security-auditor** (`.claude/agents/security/code/code-security-auditor.md`): Assisted manual review for injection, XSS, deserialization, crypto, sensitive flows.
3. **When relevant** (at least once per feature):
   - **dependency-vuln-scanner**: If `package.json`, `*.csproj`, `pom.xml` in scope; Critical/High → update deps and re-run.
   - **secrets-auditor**: Scan changed files; confirmed leaks must be fixed.
4. **On Critical/High findings**:
   - Produce **Security Findings Report**.
   - **Re-invoke developer** with report; developer fixes and commits.
   - **Return to 7a**: Re-run active sub-steps — **frontend**: **7a** → **7a2** → **7b** → **7c**; **backend**: **7a** → **7a2** → **7c** (omit **7b**).
5. **On no Critical/High**: Exit loop; proceed to step 8 (code-tagger).
6. **Contextual** (invoke when scope justifies): auth-security-specialist (login/OAuth/JWT), cloud-security-reviewer (IaC), runtime-security-tester (API/staging attacks).

## Security Findings Report Format

```markdown
## Security Findings Report

- **Status**: has_critical_or_high
- **Source**: static-analysis-enforcer and/or code-security-auditor
- **Transaction**: {tx-id}

### Critical / High findings

| Severity | File / location | Description | Recommendation |
|----------|-----------------|-------------|----------------|
| ... | ... | ... | ... |

### Summary

- Total Critical: X
- Total High: Y
- Other (Medium/Low): Z

### Recommendation

Re-invoke **developer** with this report. After fixes and commit, re-run active steps: **7a** (unit), **7a2** (build), **7b** (E2E) on **frontend** when applicable, then **7c** (code security).
```

**Report location**: `{{PATH_DOCS}}/4-implementation/development/{tx-id}/tests/` or include in response.

## Agent Sequence

1. static-analysis-enforcer (always)
2. code-security-auditor (always)
3. dependency-vuln-scanner (when manifests in scope)
4. secrets-auditor (scan changed files)
5. Contextual: auth-security-specialist, cloud-security-reviewer, runtime-security-tester as needed

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` or `.claude/commands/backend-development.md` — step **7c** **Code security**.
- **Agents**: `.claude/agents/security/code/static-analysis-enforcer.md`, `.claude/agents/security/code/code-security-auditor.md`, `.claude/agents/security/supply-chain/dependency-vuln-scanner.md`, `.claude/agents/security/supply-chain/secrets-auditor.md`.
