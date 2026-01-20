---
description: Conduct technical research and document findings for feature planning.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Purpose

Guide technical research during the planning phase. Research helps:
- Resolve technical unknowns
- Compare alternative approaches
- Document decisions and rationale
- Prevent costly mistakes during implementation

## When to Use

- During `/spec-kitty.plan` when technical questions arise
- When evaluating libraries, frameworks, or patterns
- Before making significant architectural decisions
- When the team lacks expertise in a specific area

## Research Process

### 1. Define the Question
What specific question needs answering?
- "Which state management solution fits our needs?"
- "How do we implement real-time sync?"
- "What's the best approach for file uploads?"

### 2. Identify Criteria
What factors matter for this decision?
- Performance requirements
- Team expertise
- Maintenance burden
- Integration complexity
- License compatibility

### 3. Gather Information
- Official documentation
- Community best practices
- Performance benchmarks
- Security considerations
- Real-world case studies

### 4. Evaluate Options
Compare alternatives against criteria:
```
| Option | Performance | Complexity | Team Exp | Maintenance |
|--------|-------------|------------|----------|-------------|
| A      | High        | Medium     | High     | Low         |
| B      | Medium      | Low        | Medium   | Medium      |
| C      | High        | High       | Low      | High        |
```

### 5. Document Decision
Record the outcome in `research.md`:
```markdown
## Decision: [Topic]

**Question**: [What we needed to decide]

**Options Considered**:
1. Option A - [Brief description]
2. Option B - [Brief description]
3. Option C - [Brief description]

**Decision**: Option A

**Rationale**:
- [Reason 1]
- [Reason 2]
- [Reason 3]

**Trade-offs Accepted**:
- [What we're giving up]
- [Risks we're accepting]

**References**:
- [Link to documentation]
- [Link to benchmark]
```

## Research Output

Research findings go in `FEATURE_DIR/research.md`:

```markdown
# Research: [Feature Name]

## Technical Decisions

### 1. [Topic 1]
[Decision documentation]

### 2. [Topic 2]
[Decision documentation]

## Open Questions

- [ ] [Question that still needs answering]

## References

- [Useful links discovered during research]
```

## Integration with Workflow

- Called during `/spec-kitty.plan` Phase 0
- Outputs feed into `plan.md` Technical Context
- Referenced during `/spec-kitty.implement` for guidance

## Tips

1. **Time-box research** - Don't spend days on minor decisions
2. **Document as you go** - Don't rely on memory
3. **Validate assumptions** - Test critical unknowns with prototypes
4. **Get team input** - Leverage collective knowledge
5. **Review periodically** - Decisions may need revisiting
