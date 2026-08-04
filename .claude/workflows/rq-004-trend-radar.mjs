export const meta = {
  name: "rq-004-trend-radar",
  description:
    "Runs RQ-004 (Trend Radar v1) through the AIDLC flow, one sub-requirement at a time, parallelising only what is genuinely independent",
  whenToUse:
    "After RQ-004_01..08 have been specified and their clarifications answered. Pass the sub-requirement id as args, e.g. \"RQ-004_03\".",
  phases: [
    { title: "Architect", detail: "tech spec from the complete requirement" },
    { title: "Test plan", detail: "cases derived from the requirement, before code" },
    { title: "Implement", detail: "one agent per independent unit" },
    { title: "Verify", detail: "typecheck, tests, build, adversarial review" },
    { title: "Gate", detail: "the sub-requirement's own exit criterion" },
  ],
};

/**
 * The loop, and why it is shaped this way.
 *
 * AIDLC is sequential per requirement on purpose: the architect reads the
 * specified requirement, the developer reads the tech spec, the reviewer reads
 * both. Parallelising those steps would have each agent working from something
 * the previous one had not finished writing.
 *
 * So parallelism goes sideways, not forwards: inside a step, across units that do
 * not share files. The four collectors are the clearest case. They implement one
 * interface, live in four files, and touch nothing else, so four agents can write
 * them at once. Scoring and the API are not: the API's response shape comes from
 * what the scorer returns.
 *
 * Non-stop is bounded by gates, not by agents. RQ-004_02 (query precision) and
 * RQ-004_04 (does the radar actually lead the media) are go/no-go. A loop that
 * runs through a failed gate does not save time, it builds further on a
 * measurement that is wrong.
 */

const REQ = typeof args === "string" ? args : args?.requirement;
if (!REQ) {
  throw new Error(
    "Pass the sub-requirement id, e.g. Workflow({name:'rq-004-trend-radar', args:'RQ-004_03'})"
  );
}

const DOCS = `.claude/docs/requirements/RQ-004-trend-radar/${REQ}`;

/** Units that can be written at the same time, per sub-requirement. */
const UNITS = {
  "RQ-004_01": [
    "prisma schema: Entity, SignalPoint split by scope per PLAN-REVIEW F2, ArticleEntity join, JobType additions",
    "lib/ai/claude.ts: extractEntities, following the categorizeArticle pattern, on the cheapest acceptable model per PLAN-REVIEW",
    "lib/signals/entities.ts: alias resolution, case-insensitive, create-if-new",
    "scripts/backfill-media-entities.ts: resumable, batched, idempotent",
  ],
  "RQ-004_02": [
    "scripts/validate-entity-queries.ts: sample hits per entity per source, record precision, deactivate below threshold",
  ],
  "RQ-004_03": [
    "lib/signals/collectors/hn.ts",
    "lib/signals/collectors/arxiv.ts",
    "lib/signals/runner.ts + scripts/backfill-signals.ts",
  ],
  "RQ-004_04": [
    "scripts/validate-lead-time.ts: for entities that reached media, the first week upstream fired; report median lead and false positive rate",
  ],
  "RQ-004_05": [
    "lib/signals/score.ts: per-source statistics on the same scale per PLAN-REVIEW F3, composite, gates",
    "lib/signals/stages.ts: stage classification and upstreamOnly",
    "app/api/trends/route.ts: new shape, ?mode=topics kept",
    "app/api/cron/snapshot/route.ts + vercel.json entry",
  ],
  "RQ-004_06": ["lib/signals/collectors/github.ts", "lib/signals/collectors/pypi.ts"],
  "RQ-004_07": ["app/dashboard/trends/page.tsx: stage badge, upstream-only filter, source ecosystems"],
  "RQ-004_08": ["lib/reports/trend-report.ts + the manual trigger on the Trends screen"],
};

/** Sub-requirements that must not be built past without a human decision. */
const GATES = {
  "RQ-004_02":
    "Per-source query precision meets the agreed threshold for every active entity, or the entity is deactivated.",
  "RQ-004_04":
    "Median lead time and false positive rate meet the thresholds agreed in the requirement. This is go/no-go on the whole feature.",
};

const units = UNITS[REQ];
if (!units) throw new Error(`Unknown sub-requirement ${REQ}`);

const SPEC_SCHEMA = {
  type: "object",
  required: ["path", "summary", "risks"],
  properties: {
    path: { type: "string" },
    summary: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};

const UNIT_SCHEMA = {
  type: "object",
  required: ["unit", "files", "summary", "testsAdded", "openIssues"],
  properties: {
    unit: { type: "string" },
    files: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    testsAdded: { type: "number" },
    openIssues: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};

const VERDICT_SCHEMA = {
  type: "object",
  required: ["holds", "reason"],
  properties: {
    holds: { type: "boolean" },
    reason: { type: "string" },
    evidence: { type: "string" },
  },
  additionalProperties: false,
};

// ---------------------------------------------------------------- 1. Architect
phase("Architect");
log(`${REQ}: writing the technical specification`);

const spec = await agent(
  `You are the architect for ${REQ}, part of RQ-004 Trend Radar v1.

Read, in this order:
- ${DOCS}/${REQ}-complete-requirement.md
- .claude/docs/requirements/RQ-004-trend-radar/PLAN-REVIEW.md  (the findings are binding, not advisory)
- CLAUDE.md and docs/AIDLC.md for the conventions of this codebase
- The existing lib/trends/compute.ts and app/api/trends/route.ts, which this replaces

Write ${DOCS}/${REQ}-tech-spec.md. This is Next.js and TypeScript with Prisma, not
.NET or Angular: ignore the stack instructions in the shared agent set and follow
this repository's patterns.

The units to be implemented are fixed:
${units.map((u, i) => `  ${i + 1}. ${u}`).join("\n")}

For each, state the files, the exported signatures, and the failure modes. Where
PLAN-REVIEW names a defect in the original plan, your spec must say how it is
avoided, by name of the finding.`,
  { label: `architect:${REQ}`, schema: SPEC_SCHEMA }
);

log(`spec at ${spec?.path ?? "unknown"}; ${spec?.risks?.length ?? 0} risks recorded`);

// --------------------------------------------------------------- 2. Test plan
phase("Test plan");

const testPlan = await agent(
  `You are the test planner for ${REQ}.

Read ${DOCS}/${REQ}-complete-requirement.md and ${DOCS}/${REQ}-tech-spec.md.

Write ${DOCS}/tests/${REQ}-test-plan.md: the cases that would catch this being
wrong, before any of it is written. Cover the statistical edges specifically,
since PLAN-REVIEW F3 shows the original plan's scoring degenerates on sparse
series: zero-variance baselines, single-observation series, a source absent
entirely, and a count series where the current week is the first non-zero value.

Vitest, colocated the way lib/opml/parser.test.ts is. Name each case so a failure
reads as a sentence about the product, not about the code.`,
  { label: `test-plan:${REQ}`, schema: SPEC_SCHEMA }
);

log(`test plan at ${testPlan?.path ?? "unknown"}`);

// --------------------------------------------------------------- 3. Implement
phase("Implement");
log(`${units.length} unit(s), written in parallel because they share no files`);

const built = await parallel(
  units.map((unit, index) => () =>
    agent(
      `You are implementing one unit of ${REQ}, in this repository.

Unit ${index + 1} of ${units.length}: ${unit}

Read ${DOCS}/${REQ}-tech-spec.md and ${DOCS}/tests/${REQ}-test-plan.md first, and
.claude/docs/requirements/RQ-004-trend-radar/PLAN-REVIEW.md for the findings the
spec is written against.

Rules that are not negotiable in this codebase:
- Tag new code with ${REQ} where a reader would otherwise ask why it exists.
- Every API route: try/catch, and Unauthorized mapped to 401.
- Database access through the tenant client in lib/db/tenant.ts when the data is
  org-scoped. Upstream signals are global and deliberately are not.
- No long dashes anywhere, including comments and commit messages.
- Write the unit tests from the test plan alongside the code, not after.
- Do not touch files outside your unit. Another agent is working on the others.

Finish by running: npx tsc --noEmit, then npx vitest run on your own test files.
Report honestly: if something does not pass, say so in openIssues rather than
leaving it for the verifier to find.`,
      { label: `build:${unit.split(":")[0].slice(0, 28)}`, schema: UNIT_SCHEMA }
    )
  )
);

const done = built.filter(Boolean);
const openIssues = done.flatMap((u) => u.openIssues ?? []);
log(
  `${done.length}/${units.length} units built, ${done.reduce((n, u) => n + (u.testsAdded ?? 0), 0)} tests added, ${openIssues.length} issues reported by the builders`
);

// ------------------------------------------------------------------ 4. Verify
phase("Verify");

/**
 * Three verifiers with different lenses rather than three of the same, because
 * these fail in unrelated ways: the gates run or they do not, the statistics are
 * defensible or they are not, and the tenant boundary holds or it leaks.
 */
const LENSES = [
  {
    id: "gates",
    prompt: `Run the whole verification suite for this repository and report what actually happened, quoting output:
  npx tsc --noEmit
  npx vitest run
  npx next build
Then confirm every unit's tests exist and are wired into the suite rather than
merely present as files. holds = every command passed.`,
  },
  {
    id: "statistics",
    prompt: `Review the scoring and aggregation code added for ${REQ} against PLAN-REVIEW
findings F3 and F4. Try to break it: a baseline of all zeros, a baseline of one
observation, a series where variance is zero but the mean is not, weekly and daily
points in the same range, a source that is absent. For each, state what the code
returns and whether that number is defensible or merely finite. holds = no case
produces a number that would be presented to a user as an acceleration when it is
not one.`,
  },
  {
    id: "boundaries",
    prompt: `Review ${REQ} for tenant and idempotency boundaries. Two specific things:
whether every org-scoped write goes through lib/db/tenant.ts, and whether the
unique constraints actually prevent duplicates given Postgres treats NULLs as
distinct, which is PLAN-REVIEW F2. Prove idempotency by reasoning about a second
run of each backfill, not by assuming the upsert is enough. holds = no
cross-tenant path and no duplicate path.`,
  },
];

const verdicts = await parallel(
  LENSES.map((lens) => () =>
    agent(
      `${lens.prompt}\n\nBe adversarial. A passing report that misses a real defect is worse than a failing one. Default to holds=false when you are unsure, and say what you could not establish.`,
      { label: `verify:${lens.id}`, schema: VERDICT_SCHEMA, effort: "high" }
    ).then((v) => ({ lens: lens.id, ...(v ?? { holds: false, reason: "verifier died" }) }))
  )
);

const failed = verdicts.filter((v) => !v.holds);

// -------------------------------------------------------------------- 5. Gate
phase("Gate");

const gate = GATES[REQ];
let gateResult = null;

if (gate && failed.length === 0) {
  gateResult = await agent(
    `${REQ} carries a go/no-go gate:

  ${gate}

Run whatever the requirement says produces the evidence, read the output, and
report against the threshold. Do not soften the result. If the measurement says
the feature does not work, that is the finding, and reporting it is the value of
this step.`,
    { label: `gate:${REQ}`, schema: VERDICT_SCHEMA, effort: "high" }
  );
}

return {
  requirement: REQ,
  spec: spec?.path,
  testPlan: testPlan?.path,
  unitsBuilt: done.map((u) => ({ unit: u.unit, files: u.files, tests: u.testsAdded })),
  builderIssues: openIssues,
  verification: verdicts,
  gate: gate ? { criterion: gate, result: gateResult } : "none for this sub-requirement",
  /**
   * Deliberately not committed, pushed or deployed by this workflow. Every gate
   * in RQ-004 is a decision about whether the measurement is trustworthy, and
   * that is not a decision an agent should make on its own.
   */
  nextStep:
    failed.length > 0
      ? `Blocked: ${failed.map((f) => `${f.lens} (${f.reason})`).join("; ")}`
      : gateResult && !gateResult.holds
        ? `Gate not met: ${gateResult.reason}. Stop and decide before continuing.`
        : "Ready for review, commit and the next sub-requirement.",
};
