---
name: architecture-security-review
description: Review technical architecture for security (STRIDE, attack surface, trust boundaries). Use when executing step 4b in frontend-development or backend-development, or when asked to threat model or security-review architecture. Skip if --no-security. Prefer security-architect agent when available.
# preferred_agent: security-architect
---

# Architecture Security Review

Use this skill when you need to **review the technical specification** from a security perspective: threat modeling (STRIDE), attack surface, trust boundaries, and systemic risks. This corresponds to **step 4b** in **`/frontend-development`** or **`/backend-development`**, after step **4a** (Architect). **Skip** when `--no-security` is set.

## Where Used

- **frontend-development** / **backend-development**: step **4b** — Architecture security review (security-architect), scoped to the track’s tech-spec
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id and tech-spec path. Prefer launching **security-architect** (`.claude/agents/security/architecture/security-architect.md`) with this skill's context. If unavailable, main agent executes the procedure. |
| **In flow** | Each track command: step 4b invokes security-architect; agent follows this skill. |

## Purpose

- **Threat modeling**: Apply STRIDE or equivalent to the tech-spec.
- **Risk assessment**: Identify Critical/High architectural risks before implementation.
- **Feedback loop**: If Critical/High exist, re-invoke architect with mitigations; re-validate until acceptable.

## When to Use

- Executing **step 4b** in **frontend-development** or **backend-development**, after step **4a** has produced the track tech-spec.
- When asked to threat model, security-review architecture, or perform STRIDE analysis.

## Inputs

- **Tech-spec**: Generated in step 4a; typically in `.claude/docs/requirements/{req-id-name}/` or project specs location.
- **Complete requirement**: `{req-id}-complete-requirement.md` for context on sensitive endpoints/data.
- **Architecture decisions**: From backend-architect or frontend-architect output.

## Process

1. **Resolve paths**: Get `{req-id}` and `{req-id-name}` from context. Locate tech-spec.
2. **Invoke security-architect**: Pass tech-spec, complete-requirement, and architecture context.
3. **Analyze**: Threat model (STRIDE), attack surface, trust boundaries, sensitive endpoints/data.
4. **Decide outcome**:
   - **If Critical or High risks exist**:
     - Document mitigations in `.claude/docs/requirements/{req-id}/security-architecture-review.md` (or in tech-spec).
     - **Re-invoke architect** (backend-architect or frontend-architect) with recommendations to update tech-spec.
     - **Re-run security-architect** for validation.
   - **If no Critical/High** (or after adjustment): Proceed to the next steps in the active track (e.g. 4c / Track Test on frontend; 4d / 5d on backend).
5. **Output**: Security architecture review document; updated tech-spec if adjustments were made.

## Outputs

- **security-architecture-review.md** (optional): When mitigations are documented separately, e.g. `.claude/docs/requirements/{req-id}/security-architecture-review.md`.
- **Updated tech-spec**: When architect was re-invoked with security recommendations.

## Loop Rule

Loop until no Critical/High architectural risks remain. Document each iteration's findings and mitigations.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` or `.claude/commands/backend-development.md` — step **4b** **Architecture security review**.
- **Preferred agent**: `.claude/agents/security/architecture/security-architect.md`.
- **Architect agents**: `.claude/agents/backend/backend-architect.md`, `.claude/agents/frontend/frontend-architect.md`.
