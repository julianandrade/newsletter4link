---
name: contextual-security-review
description: Invoke contextual security agents (auth, cloud, runtime, supply-chain) when scope justifies. Use when executing step 10 in frontend-development or backend-development, or when asked for contextual security review. Skip if --no-security.
---

# Contextual Security Review

Use this skill when you need to **invoke additional security agents** based on feature scope: authentication, cloud/IaC, runtime attacks, supply chain. This corresponds to **step 10** in **`/frontend-development`** or **`/backend-development`**. **Skip** when `--no-security` is set. security-architect is already used in step **4b**; invoke others when scope justifies.

## Where Used

- **frontend-development** / **backend-development**: step **10** — Contextual security agents
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id and scope description. Select and launch relevant agents from `.claude/agents/security/` per the decision table below. |
| **In flow** | Step 10 invokes contextual agents as needed; no single preferred agent. |

## Purpose

- **Scope-based**: Invoke only agents relevant to the feature (login, IaC, API, pipeline).
- **Optional per scope**: Run at least once per feature when scope includes the domain.
- **Post-implementation**: After step 9; does not block flow.

## When to Use

- Executing **step 10** in **frontend-development** or **backend-development**, after step **9**.
- When asked for auth security review, cloud security, runtime testing, or supply chain review.

## Agent Selection

| Scope | Agent | Path |
|-------|-------|------|
| Login, OAuth, JWT, access control | **auth-security-specialist** | `.claude/agents/security/architecture/auth-security-specialist.md` |
| Terraform, K8s, IaC, cloud config | **cloud-security-reviewer** | `.claude/agents/security/infra-cloud/cloud-security-reviewer.md` |
| API/staging attack tests, runtime | **runtime-security-tester** | `.claude/agents/security/runtime/runtime-security-tester.md` |
| Pipeline, build, CI/CD changes | **supply-chain-guardian** | `.claude/agents/security/supply-chain/supply-chain-guardian.md` |
| Significant architecture changes | **security-architect** | `.claude/agents/security/architecture/security-architect.md` |

## Process

1. **Assess scope**: Does the requirement touch login/auth? IaC? API endpoints? Pipeline?
2. **Select agents**: Use table above.
3. **Invoke**: Pass feature context, tech-spec, changed files.
4. **Document findings**: Any Critical/High should be addressed; recommend fixes.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` or `.claude/commands/backend-development.md` — step **10** **Contextual security**.
- **Agents**: `.claude/agents/security/` (architecture/, infra-cloud/, runtime/, supply-chain/).
