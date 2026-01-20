# Visual Review Skill

## Purpose

Capture screenshots and perform visual testing to detect UI regressions and ensure design consistency.

## Trigger

Run this skill when:
- Reviewing UI changes
- Validating responsive design
- Checking accessibility
- Comparing before/after states

## Capabilities

### Screenshot Capture
Capture screenshots of specific pages or components:

```
mcp__playwright__screenshot({
  url: "<!-- DEV_SERVER_URL -->",
  path: "screenshots/homepage.png",
  fullPage: true
})
```

### Visual Comparison
Compare screenshots to detect changes:

```
mcp__playwright__compare({
  baseline: "screenshots/baseline/homepage.png",
  current: "screenshots/current/homepage.png",
  diff: "screenshots/diff/homepage.png"
})
```

### Responsive Testing
Test multiple viewports:

```
Viewports to test:
- Desktop: 1920x1080
- Tablet: 768x1024
- Mobile: 375x667
```

## Workflow

1. **Start dev server**:
   ```bash
   <!-- DEV_SERVER_COMMAND -->
   ```

2. **Capture baseline** (if first time):
   ```
   mcp__playwright__screenshot(url, "baseline/page.png")
   ```

3. **Capture current state**:
   ```
   mcp__playwright__screenshot(url, "current/page.png")
   ```

4. **Compare and report**:
   ```
   mcp__playwright__compare(baseline, current, diff)
   ```

## Output Format

```
Visual Review Results
=====================

Page: Homepage (<!-- DEV_SERVER_URL -->)

Desktop (1920x1080):
- Screenshot captured: ✅
- Comparison: 98.5% match (within threshold)
- Status: ✅ PASS

Tablet (768x1024):
- Screenshot captured: ✅
- Comparison: 95.2% match (within threshold)
- Status: ✅ PASS

Mobile (375x667):
- Screenshot captured: ✅
- Comparison: 87.3% match (BELOW threshold)
- Status: ❌ FAIL
- Diff saved: screenshots/diff/homepage-mobile.png

Overall: 1 viewport failed visual comparison
```

## Configuration

Set up in `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__playwright__*"
    ]
  }
}
```

## Integration

This skill integrates with:
- `/spec-kitty.review` - Visual validation during review
- `/agent.qa` - QA testing workflow
- E2E tests - Automated visual regression
