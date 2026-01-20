# Documentation Lookup Skill

## Purpose

Access current library documentation via Context7 MCP to ensure code uses current (non-deprecated) APIs.

## Trigger

Run this skill when:
- Implementing features with specific libraries
- Unsure about current API usage
- Need to verify best practices

## Supported Libraries

<!-- COMMON_PROJECT_LIBRARIES -->
Configure your commonly used libraries here:

| Library | Context7 ID | Use For |
|---------|-------------|---------|
| React | react | Components, hooks |
| TypeScript | typescript | Type definitions |
| PostgreSQL | postgresql | Database queries |

## Execution

Using Context7 MCP:

```
1. Resolve library ID:
   mcp__context7__resolve_library_id("react")

2. Query documentation:
   mcp__context7__query_docs("react", "useState hook usage")
```

## Use Cases

### Check Current API
```
Query: "What's the current way to fetch data in React?"
Result: Use React Query or SWR for data fetching, avoid useEffect for simple fetches
```

### Verify Not Deprecated
```
Query: "Is componentWillMount still valid?"
Result: componentWillMount is deprecated, use useEffect or constructor instead
```

### Find Best Practices
```
Query: "Best practice for form handling in React"
Result: Use controlled components or form libraries like React Hook Form
```

## Output Format

```
Documentation Lookup
====================

Library: React
Query: "useState with objects"

Result:
When using useState with objects, use the spread operator
to preserve other properties:

const [state, setState] = useState({ name: '', age: 0 });
setState(prev => ({ ...prev, name: 'John' }));

Note: This is the recommended pattern as of React 18.

Source: React Official Documentation
```

## Integration

This skill integrates with:
- `/spec-kitty.implement` - Look up APIs during coding
- `/spec-kitty.research` - Research phase documentation
- `/agent.dev` - Developer persona workflow
