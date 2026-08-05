---
name: functional-analysis
description: Produce the functional, business-oriented analysis of a microservice's source code, targeting non-technical audiences (product, commercial, pre-sales). Use when the user asks for a "functional analysis", "functional detail", "business documentation", or to "document service X for product/commercial/pre-sales", or to create/update `Functional Detail.md` or `Functional Detail - Interactions.md`. Do NOT use this skill for technical reviews, defect lists, or `Analysis Report.md` - that is the responsibility of the `technical-analysis` skill.
---

# Functional Analysis of a Microservice

Produces a structured functional analysis of a microservice's source code. The output documents serve as the foundation for defining the commercial offering of the services in the ecosystem under analysis. The ecosystem's domain, canonical name, and scope are defined in `common-ai-configs/.claude/docs/overview.md` - read it before doing any work. The primary audience is non-technical: product, commercial, and pre-sales teams. Write in business language throughout - describe *what* the service does and *why*, never *how*.

---

## Activation

**Activate this skill when** the user asks for any of:
- "Functional analysis" / "functional detail" of a microservice or service.
- "Document microservice X" / "document service Y" for product, commercial, or pre-sales use.
- "Business documentation" of a service.
- Create, update, or revise `Functional Detail.md` or `Functional Detail - Interactions.md`.
- Describe what a service does, its features, business entities, configurability, cross-cutting business rules, or its interactions and external integrations - in business language.

**Do NOT activate this skill when** the user asks for any of:
- "Technical analysis", "technical review", "code review" of the service.
- "Analysis Report" / `Analysis Report.md`.
- Lists of contradictions, errors, defects, bugs, anti-patterns, or improvement opportunities.
- Quality, reliability, maintainability, or architectural findings.

In those cases, defer to the `technical-analysis` skill. If a request mixes both (e.g., "produce the full analysis: functional overview AND analysis report"), run this skill for the functional documents and the `technical-analysis` skill for `Analysis Report.md`. The two skills are complementary, never overlapping.

---

## Scope

**One functional document set per service or application** in the ecosystem - both backend microservices (e.g., Sales Manager, Customer Manager, Transaction Manager) and the user-facing applications and tools (web portals, mobile apps, and workstation / desktop agents).

**Out of scope:**
- Purely technical / platform services (e.g., API gateway, cross-cutting authentication) unless they contain relevant business logic.
- Shared libraries.
- Technical findings, defects, contradictions, improvement lists, and `Analysis Report.md` - all owned by the `technical-analysis` skill.

If in doubt about whether a service is in scope, record the doubt with `[To confirm]` and validate with the lead before closing the document.

**Frontend / application repos (web portals, mobile apps, desktop agents).** These are in scope and use the same two-file output and template; adapt the sections to the nature of a client application:
- **§2 Summary and §3 Features are the core.** Describe what the user (operator, inspector, passenger, administrator) can *do* in the application - its screens, flows, and capabilities - in business language.
- **§5.3 Consumed Services is the key integration section.** List the backend services and external systems the application calls (e.g. a portal calling Identity Manager, Sales Manager, Payment Manager, Report Manager, Device Interface Agent). This is the integration map seen from the consumer side, and it must be confirmed against the application's own code (HTTP clients, service classes, environment endpoints).
- **§4 (owned entities), §5.4 (callers), §5.5 / §5.6 (published / consumed broker events) are typically `[N/A]`** for a client application - mark them so explicitly rather than inventing content. A frontend that talks to a broker, or an app that owns meaningful local state, is the exception, not the rule, and must be evidenced.
- **Do not duplicate the backends' capabilities.** Describe what the application *lets the user do* and which services it *calls*; the backend business rules themselves live in each service's own document.

**Packaging-shell repos.** If the repo only contains templates / Dockerfile / Pipelines / K8s / Postman and the README points at a separate framework repo (no submodule), state this in section 1, restrict every section to locally observable artefacts, mark runtime-behaviour sections `[Not verifiable from this repo]`, and waive the 10-30 feature target with a one-line justification.

---

## Output

A functional analysis produces two files in `common-ai-configs/.claude/docs/3-design/projects/<service-name>/` where `<service-name>` is the repository name of the service being analysed (e.g., `ms-invoice-manager`). Use Title Case filenames:

| File | Template | Contents |
|---|---|---|
| `Functional Detail.md` | `TEMPLATE_Service.md` | Complete functional analysis (sections 1-9 + Appendix A) |
| `Functional Detail - Interactions.md` | `TEMPLATE_Interactions.md` | Interactions and external integrations (sections 5-6) |

Both files must be written before the functional analysis is considered complete. If the user specifies a different output path, apply it to both files.

In addition, the skill must keep `common-ai-configs/.claude/docs/Functional Overview.md` in sync. This is a roll-up document with one section per analysed service; each section is a literal mirror of the Functional Detail §2 of that service (prose + `Main functionalities` bullet list + `Document version` field). After every analysis or review run that touches §2 (directly or via a version bump), update the corresponding section of `Functional Overview.md` to match the source §2 verbatim. The Functional Overview is not authored separately - it follows §2.

**When files already exist** from a prior analysis: read them, verify every claim against the current code, update what has changed, and explicitly confirm to the user which files required no changes. Do not silently skip unchanged files. **Any file that is modified must have its document version incremented** (minor bump: e.g., 1.0 → 1.1, 1.1 → 1.2; major bump only for full rewrites). Files that required no changes keep their existing version. See also **§Editing Existing Documents (safe-edit protocol)** below for the rule that governs *which* text changes are allowed without prior user confirmation.

---

## Editing Existing Documents (safe-edit protocol)

This protocol governs **every** form of change to text already in `Functional Detail.md` / `Functional Detail - Interactions.md` (paragraphs, bullets, table cells, titles, captions, references), including deletions. It does **not** apply to brand-new files. It is additive to the rules in §Output, §Core Principles, and §Section Guidance.

**1. Hard principle.** No pre-existing word may be substituted, reformulated, abbreviated, expanded, or removed unless the change is **evidenced by code observed in the present analysis run** (a class, controller, listener, scheduler, repository, flow, template, schema, or validation rule inspected in this run that makes the current text outdated, incomplete, or incorrect). Evidence from prior analyses, memory, other documents, configuration files, or intuition does **not** count - see §Core Principles "Factuality" and "Evidence boundary". The principle applies equally when a paragraph violates a tone rule (marketing fluff, customer name, `to author`, etc.): you must still ask before rewriting.

**2. What is NOT evidence** (non-exhaustive):
- Personal preference about style, tone, or wording ("sounds better", "clearer", "more commercial").
- Client neutralisation, brand removal, or alignment with recently introduced conventions (e.g., `to author` → `to create`).
- Shortening text "to look cleaner"; reordering bullets or sections; removing chapters that "do not add value".
- Rewriting to apply the controlled vocabulary; conventions inherited from other skills; pattern matches with other services' documents.

The only exception: removing literal template placeholders never filled in (e.g., a remaining `[Service name]` from `TEMPLATE_Service.md`).

**3. Confirmation protocol when there is no code evidence.** Use `AskUserQuestion` with: (a) file path and location (section / heading / row); (b) the pre-existing text quoted literally; (c) the proposed replacement quoted literally; (d) the reason for the change plus an explicit statement that no code evidence was found. Wait for the response - do **not** preview with Edit/Write before approval. Batch same-kind changes (e.g., one term in 20 places) into a single question listing 1-3 concrete examples.

**4. Changes with direct code evidence.** Apply without asking, and record a one-line note in the final run summary naming the code artefact (file / class / method) that justifies it.

**5. End-of-run summary.** Output three short lists: (a) evidence-based changes applied automatically, (b) unevidenced changes confirmed after asking, (c) unevidenced changes rejected by the user. The document version follows the same bump rules as evidence-based edits (see §Output).

---

## Analysis Process

The process is organised in three phases separated by an explicit user-dialogue gate. The writing phase does not begin until the gate is closed.

### Phase 1 — Analysis

Follow these steps in order:

0. **Read project context.** Before any other step, read `common-ai-configs/.claude/docs/overview.md`. This file is the project-specific source of:
   - The canonical product / ecosystem name (to be used in §2 Summary product-level references)
   - The list of forbidden client / operator / tenant names that must never appear in functional documents
   - The business domain language to use in examples and personas
   - The inventory and canonical names of services in the ecosystem (so all integration diagrams use consistent names)
   - Any project-specific extensions to the controlled vocabularies (e.g. additional Business Domain categories)

   If `overview.md` is missing or empty, ask the user before generating any functional document.

1. **Read the README** and any existing documentation of the service, even if outdated.
2. **Identify entry points** - REST controllers, event consumers, scheduled jobs, and handlers. These give the feature map.
3. **Identify outgoing calls** - HTTP clients, broker producers/consumers, DB clients to external schemas. These give the integration map. See **§Integration Inventory (mandatory checklist)** below - it is not optional.
4. **Draft the feature list** from entry points alone - names only, no descriptions yet.
5. **Validate granularity** (see §Section 3). Adjust before writing descriptions. Target 10-30 features.

End of phase 1: produce a temporary working list of (a) what was observed in the code and (b) every ambiguity the code does not resolve on its own. Operational modes (see §Core Principles - Operational modes) must be explicitly identified at this stage.

If, while reading the code, you spot technical issues (contradictions, defects, improvements), do **not** record them in any of the functional outputs. Either keep them in a temporary note for a separate run of the `technical-analysis` skill, or mention them to the user so they can decide whether to invoke that skill.

### Phase 2 (gate) — Pre-write clarification

Before writing or updating any text in `Functional Detail.md` or `Functional Detail - Interactions.md`, present the user with a structured list of clarification questions covering every unresolved ambiguity from phase 1. Each entry must state the ambiguity, the two-or-more readings the agent considered, and the implication of each for the document. Wait for the user to answer (or explicitly defer). Writing does not begin until this gate is closed.

**Categories of question to surface in phase 2** (non-exhaustive):

- Operational modes / feature variants the code makes possible but does not name.
- Capabilities that exist in code but appear unused (no caller in the ecosystem).
- Asymmetries between similar features.
- Cross-mode behaviour: does feature X apply in both modes? Differently?
- Multiple plausible interpretations of the code where the agent had to choose.

**Hard rule:** the agent must NOT proceed to writing while material ambiguities remain unresolved. Silent choice between equally-plausible-from-code readings is the dominant cause of factual errors. Five minutes of upfront Q&A is dramatically cheaper than unpicking embedded errors during user review.

### Phase 3 — Writing

Apply the user's answers from phase 2 to the steps below. If any ambiguity was deferred, mark the affected text with `[To confirm]` rather than silently choosing a reading.

6. **Draft the integration diagram** (Excalidraw, via the `excalidraw-diagram-generator` skill) **from the Integration Inventory only**, not from intuition or "services this kind of system usually talks to". Every arrow must trace to a row in the inventory.
7. **Fill in `Functional Detail.md`** section by section.
8. **Fill in `Functional Detail - Interactions.md`** using the same interaction data as the main document.
9. **Cross-review** against documents of other services already produced - especially service names used in integration diagrams, which must match across all documents.
10. **Sync `Functional Overview.md`** to match the new §2 verbatim (see §Output for the rule).

**On a review run (file already exists), §2 Summary is part of the revision scope** - it must be re-validated end-to-end against the *current* SKILL rules and the *current* state of §3-§9, not carried over unchanged from the previous version. Re-run the Summary Evidence Checklist and the §2 guidance (blocked adjectives, blocked low-level terms, pain-point narratives, universal quantifiers, operational modes, code terminology fidelity). Adjectives that were acceptable when first written may no longer be supported by the present code; operational modes / limitations introduced later in §3 / §5 / §8 may invalidate prior universal claims and require qualification or rewrite of both the prose and the `Main functionalities` bullet list.

### Integration Inventory (mandatory checklist)

Before drawing any arrow in section 5 of either output, produce an **Integration Inventory** for the service under analysis. The inventory is a temporary working list (kept in the conversation; not shipped in the documents), and every diagram arrow / table row must map to one of its entries. No inventory entry = no arrow. The inventory is also the tie-breaker between §5 of `Functional Detail.md` and §5 of `Functional Detail - Interactions.md` when they disagree.

**Evidence rule.** Each entry must cite a **code artefact** (annotation, listener, call site). Property names, environment variables, CSV files, Postman collections, AsyncAPI YAML, OpenAPI specs, and hand-written event catalogues are useful supporting context but **never** sufficient on their own. When runtime configuration disagrees with contract / documentation files, the runtime configuration wins.

**Common pattern (apply to every subsection below):**
1. Locate the code artefact (annotation, client, listener, publisher).
2. Resolve its target (base URL for sync, topic / queue for events).
3. Confirm an **active site** exists (a method actually invokes the client; a class actually binds to the topic).
4. A property declared without a matching code site (`<x>.endpoint=...`, `events.subscriber.<x>.topic=...`) is **not** an arrow - record it as `configured but unused` / `candidate (no handler)` and explicitly skip on the diagram.

**Subsection-specific patterns:**

| Subsection | Artefacts to locate | Specific rules |
|---|---|---|
| **Synchronous outgoing** | `@FeignClient`, `WebClient`, `RestTemplate`, `HttpClient` (backend); `HttpClient.get/post/put/delete` (Angular/frontend) | Confirm the base URL points to another service / external system, not to itself. |
| **Synchronous incoming** | `@RestController` / `@RequestMapping`, or endpoints in OpenAPI spec | This service's own code cannot prove its callers. Resolve §5.4 via the **mandatory cross-service caller sweep** below (search every in-scope sibling repo for a client targeting this service). Mark `[No caller found]` only after the sweep finds nothing; never leave a blanket `[To confirm]` just because the caller evidence is not in this repo. Do **not** invent callers from domain proximity. |
| **Event publishers** | `convertAndSend`, `JmsTemplate.send`, `EventBrokerUtils.publishMetaEvent`, `MessagingTemplate.send`, or per-project equivalent | Cron jobs that publish events are still publishers - the arrow is `This Service -> Broker`, not from a "Scheduler" node. |
| **Event consumers** | `@JmsListener`, `@SolaceMessageListener`, `@RabbitListener`, `@KafkaListener`, generic `MessageListener` | (see Common pattern - this is where step 4 most often catches stale configs) |
| **External systems** | Same artefacts as sync outgoing | Pure SDK usage (e.g. MinIO, Azure Blob, AWS SDK) counts only if the SDK call is exercised in code; presence of credentials in env vars alone does not. |

**Cross-service attribution is mandatory and symmetric (§5.3/§5.4 callers AND §5.5/§5.6 events).** A service's own code proves its **outbound** edges (the clients it holds, the topics it publishes / subscribes to) but can **never** prove who **calls** it or who **consumes** its events - that evidence lives in other repos. So the inbound columns (§5.4 callers, §5.5 *Known consumers*, §5.6 *Source service*) are **not** left `[To confirm]` by default; you **must** sweep the in-scope sibling repositories before concluding. Method:

1. **Events:** identify each topic value in this service's runtime configuration (consult `overview.md` for broker naming conventions and property prefixes). Search every in-scope sibling repo for the **opposite** direction - `events.subscriber.* = <topic>` for your published topics, `events.publisher.* = <topic>` for your consumed topics - plus a matching listener / publisher call site. Each match is a confirmed counterpart.
2. **Synchronous calls:** identify how this service is addressed (its endpoint property name, context path, or service name - e.g. `business.<x>.endpoint`). Search every in-scope sibling repo for that endpoint property **and a call site that uses it** (a `WebClient` / `RestTemplate` / `FeignClient` / `HttpClient` call). Each confirmed call site is a confirmed §5.4 caller; this service's own clients give its §5.3 targets.
3. Record each attribution with the exact configuration key / call-site as evidence (e.g. *"`<Service>` - endpoint `business.<x>.endpoint` + call site `<class>`"* or *"`<Service>` - topic match via `<config-key>=<topic>`"*).
4. Conclude `[No caller found]` / `[No active producer]` / `[Not inferable from this service alone]` **only after** the sweep genuinely finds nothing across all in-scope repos. **Do not** leave a blanket `[To confirm]` merely because this service's own repo lacks the evidence, and **do not** promote a guess to a service name. Re-verify any third-party / agent attribution yourself (topic-value matches are a frequent source of false positives - e.g. a similarly named but different topic).

**Bidirectional integration - back-propagation (mandatory).** An integration is a property of the **edge** `A -> B`, not of a single service, so the same fact must appear on **both** documents and must agree: if A's Interactions records an outbound call to B (§5.3) or a published event consumed by B (§5.5), then B's Interactions must record A as an inbound caller (§5.4) or as a consumer / source (§5.4 / §5.6), and vice versa. Therefore, whenever an analysis or review run **establishes, changes, or removes** an edge for the service under analysis, it must also **update the counterpart service's `Functional Detail - Interactions.md`** (its §5 tables, its diagrams, and its document version) so the two ends stay consistent - or, when the counterpart has no document yet, record the edge so it is applied when that document is created. Never close a run leaving a known edge asymmetric (recorded on one side, `[To confirm]` / missing on the other). **This applies in full to frontend / application reviews:** confirming from an application's code that it calls a set of backend services establishes a caller edge for each one, so **every** consumed backend's `Functional Detail - Interactions.md` §5.4 must be updated to list the application as a **confirmed** caller (with the evidence, and resolving any prior `[To confirm]` / generic "back-office portal") and its document version bumped. A frontend review that updates only the frontend's own §5.3 and leaves the backends' §5.4 unchanged is incomplete.

**Packaging-shell repos (no engine code in this repo).** When the repo contains only templates, `Dockerfile`, pipelines, K8s manifests and the README points at an external framework / engine repo: every integration must be supported by either a verified call site in the framework repo (if that repo was opened in this run) or an independent call site found in a sibling consumer repo. Env vars in `Dockerfile`, defaults in `application.properties`, and provider-name constants are **never** sufficient. Otherwise minimise the diagram to what is provable, with a short note explaining the constraint. See `§Scope - Packaging-shell repos`.

---

## Core Principles

These principles apply to both functional output documents.

**Business language first.** Describe *what* and *why*, not *how*. Avoid class names, table names, endpoint paths, and method names in functional descriptions.
- Wrong: "The `POST /sales/refund` endpoint invokes `RefundProcessor.execute()`."
- Correct: "Allows the back-office operator to issue a full refund for a completed sale."

**Current state only.** Document what the code does today. Planned, in-development, or discontinued capabilities belong in section 8 (Known Limitations), explicitly flagged.

**Operational modes.** When the service supports two or more operational modes whose feature semantics differ materially (e.g. native authoring vs external import, online vs offline, single-tenant vs multi-tenant), the modes must be:

1. Listed explicitly in §1 Purpose or §2 Summary as a top-level distinction.
2. Tagged on each affected feature in §3 with an `**Applicable in:** Mode A | Mode B | both` line.
3. Reflected in §5 (Configurability) — each mode mapped to the flag, code branch, or deployment switch that controls it.
4. Reflected in §8 when a limitation applies to one mode but not another.

Operational modes are a hidden axis that the reader cannot infer without this explicit documentation; without it, the same feature description appears universal when in fact it only applies in one mode.

**Factuality.** Everything written must be verifiable in the source code of the repo under analysis. Mark unverified information as `[To confirm]` rather than assuming. Never include callers in section 5.3 unless directly confirmed in the source (API specs, event subscription config, integration tests).

**Evidence boundary.** Variable names declared in a `Dockerfile` / `.properties` / `.yml` / `.env` / K8s manifest are not behaviour - they prove only that the variable exists. Do not promote env-var names to business rules or enforced behaviour. Cross-repo claims (callers, framework behaviour, integrations) require opening those repos in this run; otherwise omit or mark `[To confirm]`. Supplementary docs and prior analyses are leads, not facts.

**Consistency.** Use the same terms, granularity level, and format across all service documents. Service names used in integration diagrams are canonical once a document is closed - do not rename them in subsequent documents.

**Configuration files are not deployment evidence.** Files like `application.properties`, `application.yml`, `.env`, sample configs, and similar default property files hold local development / test values. Do not infer customer, operator, tenant, or environment-specific deployment from their contents. Customer-specific behaviour must be evidenced by *code* - conditional branches keyed on a customer/operator identifier, per-tenant feature flags, customer-scoped beans, or equivalent. If only a configuration value points to a specific customer, the correct statement is that the service is *configurable for that customer*, not *specifically deployed for them*. Never name a customer, operator, or tenant in the functional documents unless the source code itself ties behaviour to that party.

**Code terminology fidelity.** When the source code uses a specific term for an entity, capability, or actor (e.g. `ActionListEntity`, `DriverConsoleService`, `OfflineAuthFile`), prefer that term in the Summary. Do not paraphrase for "clarity" — code terms carry domain meaning that the commercial audience will encounter elsewhere (operator portals, integration specs, training material, RFP responses). Generic re-namings hide where the capability actually applies. In particular: when the Summary mentions field devices, name the specific device type (driver console, validator, ticket vending machine, inspection terminal, gate, parking meter, etc.) rather than a generic term (`field device fleet`, `the hardware`, `on-board equipment`); if the correct device cannot be confirmed against the code, mark `[To confirm]` instead of guessing.

---

## Section Guidance

### Functional Detail

#### Section 2 - Summary

Written as the **functional summary of the service**. *Secondary use:* this section is intended to be lifted as-is into commercial proposals, so it must be self-contained and readable by a non-technical audience (procurement officer, commercial manager, customer-organization decision-maker, or pre-sales consultant). **Primary priority is factual correctness, not promotional tone:** every claim must be evidenced in the source code analysed in this run. The commercial usefulness of the Summary comes from describing concrete capabilities the service actually implements — not from adjectives, before-after narratives of pain-points the platform replaces, or guarantees the service does not enforce.

- **Structure:** Two or three prose paragraphs followed by a bullet list of 4-8 main functionalities.
  1. **Paragraph 1 — What the service is and what it manages.** State plainly the role of the service in the platform, what it owns (entities, accounts, configurations, transactions, etc.), and the breadth of its scope. Name actors, user types, or domains using the same terms the source code uses (see Code Terminology Fidelity rule).
  2. **Paragraph 2 — How it operates.** Describe the main mechanisms grounded in the code: event publication patterns, delegation to other systems, versioning/lifecycle models, distribution to field devices, etc. An architectural keyword (`real-time`, `event-driven`, `parallel`, `versioned`, `stateful`) is acceptable only when it accurately describes implemented behaviour — not as decoration.
  3. **Paragraph 3 (OPTIONAL) — Operational characteristics the customer takes away.** Limit to characteristics that are actually implemented (e.g. multi-realm support, per-operator configurability, runtime-tuneable flags, audit on specific operations). **If this paragraph would force you to invent governance, audit, rollback, or compliance claims to fill it, drop the paragraph entirely.** Two truthful paragraphs are better than three where the closing one contains fabrications.
- **Integration-hub services.** For services whose primary function is integration (gateways, hubs, brokers, BFFs), the §2 Summary should present a **catalogue of integrations as a bullet list inside the paragraphs**, each bullet identifying:
  - The external entity (or category of external entities) addressed.
  - The functional purpose of the integration.
  - The initiator and consumer (who calls whom, who delivers what to whom).

  This is preferred over weaving the integration list into prose, because for integration-hub services the integrations *are* the product.
- **Adjectives and keywords.** Factual, business-confident tone; active voice; present tense. Adjectives like `auditable`, `automated`, `unified`, `consistent`, `end-to-end` are acceptable **only when each is backed by a specific implemented capability that can be named on demand** (the matching row must exist in the Summary Evidence Checklist below). Architectural keywords (`real-time processing`, `parallel processing`, `event streams`, `state machine`, `versioned configurations`, `commission hierarchy`, `lifecycle management`) signal architectural maturity and may appear when they accurately describe the service - do not sprinkle them for decoration. **Blocked adjectives** (do not use): `world-class`, `best-in-class`, `cutting-edge`, `next-generation`, `revolutionary`, `state-of-the-art`, `enterprise-grade`, `defensible`, `tamper-proof`, `regulator-ready`, `single trusted X`, `controlled lifecycle` (when lifecycle is not the point), `seamless` / `seamlessly`.
- **Client neutrality (hard rule):** Never name a specific customer, operator, or tenant in the Summary or anywhere else in the functional documents. The list of forbidden client / operator / tenant names is recorded in `overview.md` and must be consulted - for this codebase the current forbidden examples are `HF`, `TCB`, `Horários do Funchal`. Use only the canonical product-level terms recorded in `overview.md` (for this codebase: `the ticketing platform`, `the Ticketing Ecosystem`, `the platform`). Customer-specific behaviour is allowed only in section 5 and only when the source code itself branches on a customer identifier (see Core Principles).
- **Editorial verbs - use business language:** Prefer plain action verbs over editorial or publishing jargon. Translate: `to author` -> `to create`; `authoring` -> `creation`; `authored` -> `created`; `orchestrates` -> `coordinates`; `dispatches` -> `sends`; `assembles` -> `builds` / `prepares`.
- **Avoid (hard rules):**
  - **Low-level jargon, product / vendor / file names.** Do **not** write product/vendor names (`MongoDB`, `PostgreSQL`, `Solace`, `Kafka`, `RabbitMQ`, `Azure Blob`, `MinIO`, `Redis`, `S3`, `Dockerfile`, `Kubernetes`, `K8s`, `npm`, `Maven`, `Razor`), nor low-level wiring terms (`cron job`, `dead-letter queue`, `DLQ`, `queue`, `topic`, `pod`, `container`, `webhook`, `endpoint`, `gRPC`, `@JmsListener`). Category-level terms (`storage`, `database`, `object storage`, `event stream`, `real-time processing`, `state machine`, `asynchronous pipeline`) **are** allowed. `REST API` is acceptable as a generic entry-point descriptor when referring to a service's synchronous interface. Rule of thumb: acceptable when it describes a *pattern or capability* a CTO would recognise as a differentiator; unacceptable when it names a *specific product, file, or implementation artefact*. Vendor / event-mechanism names may appear in §3 feature notes and in §4 when describing an owned entity, but not in §2.
  - **Implementation wiring.** Never write "via REST", "using MongoDB", "triggered by a Solace event", "calls endpoint X", "publishes on topic Y". Describe **what the business outcome is**, not the plumbing.
  - **Meta-notes about the repository itself.** Never write "this repository is a packaging shell", "the implementation lives in another repo", or commentary on what the source artefact is. Such caveats, when truly relevant, belong in **section 1 (Identification - Purpose)** or **section 8 (Known Limitations)**, never in section 2. The Summary describes the **service's commercial behaviour** as offered to the customer, not the development packaging of the source repo.
  - **Repeating the full feature list from section 3.** The bullet list of `Main functionalities` summarises 4-8 capability themes, not every F-NNN.
  - **Cryptographic specifics, file format internals.** Do not name cryptographic algorithms (`AES-128-CBC`, `RSA-2048`, `SHA-256`, `PKCS#7`, IV/nonce details, key-rotation mechanics) or file-format internals (byte layouts, version bytes, encoding/serialisation specifics) in §2. These may appear in §3 feature notes when relevant.

- **Summary Evidence Checklist (mandatory).** Before finalising §2, list each claim in the Summary and map it to the code artefact that evidences it. The list is temporary (kept in the conversation, not shipped in the document).
  - Each entity, actor, or user type named: does it appear in the source code with that role?
  - Each described flow: is there a controller, listener, scheduler, or handler that implements it?
  - Each universal quantifier (`every`, `all`, `continuously`, `in real time`, `full audit`, `single source of truth for every X`): is it true *in every case*, or only in some? If only in some, replace with `selected`, `for X operations`, `when Y occurs`, `for back-office users`, etc.
  - Each claim of governance / audit / rollback / traceability / lifecycle control: which code artefact implements it? If none, remove the claim.
  - Each `[To confirm]` is acceptable in §3+ but **not in §2** — the Summary must contain only verified claims.

#### Section 3 - Capabilities and Features

**Granularity** is the most important decision for cross-document comparability.

A feature = one capability with recognisable business value, describable in one sentence, that a user (human or system) invokes as a single unit.

| Appropriate | Too coarse | Too fine |
|---|---|---|
| "Issue full refund for a sale" | "Manage sales" | "Check that the sale exists before refunding" |
| "Add product to cart" | "Handle purchases" | "Increment item quantity in cart" |
| "Process payment" | "Payments" | "Generate payment token for gateway X" |

Heuristics:
- If you need more than one sentence to describe the *purpose*, it is probably several features.
- If the "feature" is an internal step of another feature, it is a business rule, not a standalone feature.
- Variations of the same capability (e.g., pay by card vs. pay by wallet) are **one** feature with variants documented in notes, unless they involve genuinely different flows.

**Expected range:** 10-30 features. Fewer than 10 = too coarse. More than 30 = too fine.

**Feature codes:** Format `F-NNN`, starting at `F-001`. Do not reuse codes even if a feature is later removed. Codes are local to the service document.

**Feature names:** Use infinitive verb + complement (e.g., "Issue refund", "Query purchase history"). Avoid vague names like "Management of X".

**Subsection names (`### 3.N.`):** Use the canonical service or domain name exactly as it appears elsewhere in the document set. When a capability group maps to a backend service, use the service name (e.g., "Shift Manager", "Sales Manager") - never a paraphrase (e.g., not "Shift Management", not "Sales Operations"). When a group spans multiple services or has no single service owner, use a short noun phrase that names the domain (e.g., "Card and Requisition Management", "Infraction Control").

**Feature ↔ Limitations cross-references (§3 ↔ §8 bidirectional linkage).** Each feature in §3 that is constrained, qualified, or operationally affected by an entry in §8 (Known Limitations and Functional Gaps) must include an **`Associated limitations:`** line listing the §8 entries by their bold title (analogous to the existing **`Associated business rules:`** line). The reverse linkage must also hold: every §8 limitation should be traceable to at least one feature in §3 — limitations that do not relate to any documented feature are either incomplete (the §3 feature is missing) or out of scope (and belong in §1 / §9 / `Analysis Report.md`).

**Factuality rule (hard):** every `Associated limitations:` entry must be confirmed against the source in this run — both the §8 entry itself and the fact that the feature exercises the affected code path. Never link by domain proximity, never carry a line over without re-checking, never invent a link to silence the bidirectional rule. If a §8 entry has no matching feature, fix or remove the §8 entry — do not stretch a feature to make it fit. When in doubt, omit.

*Rationale:* limitations are read by commercial teams to know what cannot be sold; features are read to know what can be demonstrated. The cross-ref only achieves that when each link is itself factual.

#### Section 4 - Business Entities

- **Owner** = this service is the source of truth for the entity, even if other services keep local copies.
- **Referenced** = this service consults or stores an identifier but is not the owner.
- Document the lifecycle (states and transitions) only when it has functional relevance.
- **Lifecycle fidelity to source code.** Copy state names **verbatim from the source enum**, in source order; do not paraphrase, summarise, or skip "uninteresting" states (seven states in the enum = seven states in the documentation). When the code uses a specific noun for a state, error path, or terminal condition (`stalled`, `expired`, `quarantined`, `archived`), do not reuse that noun loosely for any other state with similar semantics - if two distinct code paths produce different terminal conditions (e.g. "retries exhausted" vs "unparseable -> stalled queue"), each is documented separately with its own name and trigger.

#### Section 5 - Configurability and Variations

Critical for the commercial offering - it distinguishes what is sellable out-of-the-box from what requires a project.

- **Configurable:** changeable via configuration file, parameter database, or admin UI - without deploying code.
- **Requires development:** any change requires modifying code and redeploying.
- **Customer-specific:** conditional logic in the code that only runs for certain customers or contexts. A row belongs here only when the source code itself branches on a customer/operator/tenant identifier (or equivalent flag). Customer-flavoured values found in `application.properties` / `application.yml` / `.env` defaults are **not** evidence of customer-specific behaviour - those are dev defaults and must be ignored when deciding what to list here.

#### Section 6 - Cross-Cutting Business Rules and Policies

Policies enforced by the service that cut across multiple features: fiscal rules, refund policies, data retention, fraud prevention.

If a rule appears in more than one feature description, document it **once** here and reference it by name in each affected feature. Never duplicate rules across features.

#### Section 7 - Reports, Exports and Data Made Available

**§7 is reserved exclusively for out-of-band data products** - periodic reports, downloadable file artefacts, offline export scripts, scheduled batch dumps, manually-executed database extracts, and equivalent deliverables that are consumed *outside* the service's own interactive surface. Anything that involves another service or portal interacting with this one through the standard channels (REST API, RPC, event publication, event consumption, shared-library + direct DB access) belongs in `Functional Detail - Interactions.md` §5, **not** in §7.

**Tests to apply when classifying a candidate output:**

- **Output is the return value of a feature being invoked** (REST endpoint response, RPC reply) -> goes into §3 (Capabilities) as a feature; its consumers go into Interactions §5.3 / §5.4. **Not in §7.**
- **Output is an event published on a topic** -> goes into Interactions §5.5 (Published Business Events). **Not in §7.**
- **Output is an event consumed from a topic** -> goes into Interactions §5.6 (Consumed Business Events). **Not in §7.**
- **Output is a downloadable file, scheduled extract, manually-executed export script, exported report (PDF / Excel / CSV), or any artefact delivered out-of-band** -> DOES belong in §7.
- **Output is data exposed only through a shared library (direct DB access by linked services)** -> goes into Interactions §5.3 with the `Shared library / direct DB access` interaction type. **Not in §7.**

**Optional pointer:** §7 may include a final pointer paragraph (`> Other data produced by the service... is documented in Functional Detail - Interactions.md §5.`) so a reader landing in §7 knows where to find the rest. Keep it short - do not re-summarise the Interactions content.

#### Section 8 - Known Limitations and Functional Gaps

A high-value section for the commercial team. Include:
- Missing capabilities that are frequently requested.
- Existing features with non-obvious restrictions.
- Technical debt that constrains functional evolution.
- Gaps between what the service does and what the solution appears to enable commercially.
- Integration concerns (shared databases, tight synchronous coupling on critical paths, undocumented dependencies).

Be candid. This section prevents the commercial team from selling what does not exist.

Note: detailed technical defects, contradictions, and improvement opportunities do **not** belong here. They belong in `Analysis Report.md`, which is owned by the `technical-analysis` skill. Section 8 is limited to functional gaps and limitations expressed in business language.

**Limitations must distinguish defects from design.** Before recording a §8 entry that frames a behaviour as broken / non-functional / development-only, the agent must check: is this gating-by-flag part of an intended operational mode (see §Core Principles - Operational modes), or is it actually a defect?

If the same flag selects between two operational modes, then "feature X only works when flag is true" is **design**, not a defect — it should be documented in §1 (Purpose), §5.1 (Configurability), and per-feature with the appropriate `Applicable in:` mode tag, not in §8.

Limitations in §8 are restricted to:

- **Missing capabilities** (e.g. "no bulk operations");
- **Broken implementations** (e.g. "role update fails do not log a warning");
- **Technical debt that constrains evolution** (e.g. "entity type is a hard-coded enum");
- **Gaps the commercial team must know about** (e.g. "no recovery mechanism for deleted users");
- **Security weaknesses** (e.g. "static all-zeros IV used for AES encryption");
- **Operational risks not detected by the service itself** (e.g. "no internal alerting if all regeneration triggers fail to fire").

Behaviour that is correct in one mode and intentionally inactive in another is design, not a limitation.

**Architectural observations do not belong in §8.** Statements about deployable boundaries, separation-of-concerns, single-responsibility violations, or service-decomposition critique are architectural observations, not functional limitations. They belong in §9 Additional Notes (when relevant context for the reader) or in `Analysis Report.md` (when they represent a technical concern). §8 entries must describe what the customer cannot do or cannot rely on, in business terms.

**§8 evidence checklist.** Before stating *"no X exists"*, *"Y is the only Z"*, or *"the system does not support W"*, the agent must:

1. **Grep for X / Z / W in the source.** If found, the limitation is invalid or must be reformulated to capture the actual nuance.
2. **Verify both halves of any asymmetry.** When stating *"only X has feature F"*, confirm both that X has F and that the others lack it. Inverted asymmetries are a recurring failure mode.
3. **Distinguish "absent" from "exists but unused".** If a capability is present in code but has no caller in the ecosystem, say so explicitly: "exists but is not currently exercised by any consumer". Do not state it as absent.

---

### Interactions Document

Sections 5 and 6 of `Functional Detail - Interactions.md` contain the same interaction data as the main document - they are a companion view, not a summary.

#### Sections 5.1 and 5.2 - Integration Diagrams

Every interactions document must contain **two separate Excalidraw diagrams**, each answering *"who does this service talk to, in which direction, and how?"* but for a different interaction style:

- **5.1 Synchronous Integration Diagram** - request/response only: REST, gRPC, SOAP, GraphQL, and equivalent. No events, no broker, no asynchronous queues.
- **5.2 Event-Driven Integration Diagram** - broker-mediated events only: Solace, Kafka, AMQP, MQTT, and equivalent. No synchronous REST/gRPC/SOAP calls.

Never mix synchronous calls and broker events in the same diagram. If a service uses only one of the two styles, keep both subsections in the document and mark the unused diagram `[N/A]` with a one-line justification (no `.excalidraw` file is produced for an `[N/A]` subsection).

##### How the diagrams are produced and referenced

Diagrams are **Excalidraw files** living next to `Functional Detail - Interactions.md`. Each populated subsection produces **two on-disk artefacts**: the `.excalidraw` file (editable source of truth) and a rendered `.svg` referenced by the markdown via a standard image link. The two files are siblings in the same project folder; the markdown only contains the relative link, not the image bytes.

| Subsection | Editable source on disk | Rendered image on disk | Markdown reference |
|---|---|---|---|
| 5.1 Synchronous  | `sync-integration.excalidraw`  | `sync-integration.svg`  | `![Synchronous integration diagram](./sync-integration.svg)` |
| 5.2 Event-Driven | `event-integration.excalidraw` | `event-integration.svg` | `![Event-driven integration diagram](./event-integration.svg)` |

SVG (not PNG) is used because it is vector (scales cleanly), small (a typical diagram is 5-20 KB), produced by pure string construction in Node (no native dependencies like `sharp`, `puppeteer`, or `canvas`), and renders natively in VS Code preview, GitHub, and every standard markdown viewer.

**Generation pipeline** (every time the diagram is created or refreshed):

1. Invoke the **`excalidraw-diagram-generator`** skill to produce / update the `.excalidraw` file using a graph-layout algorithm so labels do not overlap arrows.
2. Render the `.excalidraw` to an SVG and write it to disk as `<name>.svg` next to the `.excalidraw` source. Both files share the same intermediate model, so they stay in visual sync.
3. Ensure the markdown contains a standard image link to the `.svg` (markdown native `![alt](./file.svg)` syntax); replace any pre-existing `<img src="data:...">` tag with this form.

In the markdown, each populated subsection therefore contains:

```
![Synchronous integration diagram](./sync-integration.svg)

Editable source: [sync-integration.excalidraw](./sync-integration.excalidraw) - open with Excalidraw (https://excalidraw.com) or the Excalidraw VS Code extension.
```

When the diagram is regenerated, both `.excalidraw` and `.svg` are overwritten so they stay in sync; the markdown text does not need to change because the link is path-based. An `[N/A]` subsection produces **neither** the `.excalidraw` nor the `.svg`, and the markdown contains the `[N/A]` justification text in place of the image link.

##### Diagram rules (apply to both diagrams)

1. **Central node** = the service being documented, visually emphasised (filled background, bold stroke).
2. **Arrow direction** = who initiates the communication. An arrow from A to B means A calls/sends to B.
3. **Solid arrows** for synchronous calls in 5.1. **Dashed arrows** for broker publication and consumption in 5.2.
4. **Broker representation (5.2 only):** a dedicated broker node sits between `This Service` and its counterparts: `Service -.-> Broker` (publication) and `Broker -.-> Service` (consumption). The broker node appears only in 5.2.
5. **Label every arrow.** In 5.1 use `interaction type · protocol` (e.g., `sync · REST`, `sync · gRPC`). In 5.2 the label is normally the business event name (e.g., `SaleCompleted`); add the transport (e.g., `Solace`, `Kafka`) only when it varies across arrows in the same diagram.
6. **Group nodes** visually (proximity, grouping rectangles, or consistent colour blocks) when it aids readability - typically separating internal services from external systems. In 5.1 this grouping must follow the horizontal layout in rule 7.
7. **Horizontal layout (5.1 only).** Arrange nodes left-to-right by role: **internal entities/systems on the left**, **`This Service` (the analyzed service) in the centre**, **external systems on the right**. This rule governs node placement only; arrow direction continues to encode who initiates the call (rule 2) and is independent of position. Use the same internal/external classification as in section 6 (External Integrations) and in the colour scheme of rule 9. This rule does **not** apply to 5.2, where the broker occupies the centre.
8. **Node naming** must match exactly the names used in the interaction tables and in the other diagram (a service that appears in both 5.1 and 5.2 must use the same node label in both).
9. **Visual distinction.** Use a consistent colour scheme so that the central service, internal services, external systems, and (in 5.2) the broker are immediately distinguishable. Suggested palette:
   - `This Service` (centre): filled light blue (`#a5d8ff`), bold stroke.
   - Internal services: light grey/white (`#f8f9fa`), thin stroke.
   - External systems: light yellow (`#fff3bf`), thin stroke.
   - Broker (5.2): light green (`#b2f2bb`), distinct from any service node.
10. **Diagram-table consistency is mandatory.** Every arrow in 5.1 must correspond to a row in 5.3 (outgoing) or 5.4 (incoming); every arrow in 5.2 must correspond to a row in 5.5 (published) or 5.6 (consumed). And vice versa.
11. If either diagram exceeds 15-20 nodes, split it visually inside the same `.excalidraw` file (e.g., side-by-side "Internal" / "External" groups), not into separate files. In 5.1 the split must still respect the left/centre/right layout from rule 7.

Do not include in either diagram: endpoints, ports, paths, authentication details, protocol versions, internal topologies (load balancers, caches), or internal feature flows.

#### Sections 5.3-5.6 - Interaction Tables

Describe the **purpose** of each interaction in business language, not its technical implementation.
- Wrong: "Calls `GET /customers/{id}`."
- Correct: "Queries the Customer Management service to validate the buyer's eligibility for the product."

**Event naming:** Use business-level event names (e.g., `SaleCompleted`, `CustomerUpdated`). If the technical name differs significantly (e.g., `sale.completed.v2`), record it in a note. Always use the business name in the table and diagram.

#### Section 6 - External Integrations

List only integrations with systems **external to the solution** - examples include payment gateways, ERPs, industry-specific authority systems (e.g. transport authorities, regulatory bodies), SMS/email providers, loyalty programmes. The relevant external system categories for the project under analysis are documented in `overview.md`. Internal microservice integrations go in section 5.

**Criticality:**
- `High` - without this integration, core features stop working.
- `Medium` - secondary features are affected.
- `Low` - minor degradation or purely informational.

---

## Controlled Vocabularies

Use these terms exactly in the interaction tables and diagram labels.

### Business Domain

The value of `Business domain` (section 1 - Identification) must be exactly one of the categories below. The list is the project-agnostic default; **a project may add its own domain-specific category** as documented in `overview.md` (for this codebase: `Ticketing Microservices`).

- `Base Libraries`
- `Core Microservices`
- `Operational Microservices`
- `Management Microservices`
- `Platform & Integration Services`
- `Development and Testing`
- `Applications and Portals`
- `Tools and Utilities`
- `Legacy Modules`
- *(plus project-specific categories from `overview.md`)*

If none of the categories clearly fits the project under analysis, pick the closest match and mark the value with `[To confirm]`.

### Feature Status
- `Active` - in production and used
- `Legacy` - still available but not recommended or being replaced
- `Feature flag` - toggleable by configuration (include the flag name)
- `Customer-specific: <customer>` - only active for specific customers or contexts

### Interaction Type
- `Synchronous` - direct call with immediate response (REST, gRPC, SOAP, GraphQL)
- `Asynchronous` - queued request that does not wait for an immediate response
- `Event` - pub/sub message without knowledge of consumers
- `Shared library / direct DB access` - when a downstream service links against a shared library JAR (or equivalent) that provides direct repository access to this service's database. Distinct from REST and event channels.

### Protocol / Technology
- `REST` (HTTP/JSON)
- `gRPC`
- `GraphQL`
- `SOAP`
- `AMQP` (e.g., RabbitMQ, Solace)
- `Kafka`
- `MQTT`
- `WebSocket`
- `SFTP / file transfer`
- `Shared database` (flag as a limitation in section 8 if present, and recommend invoking the `technical-analysis` skill to record it as a finding)
- `Other: <name>`

If a service uses more than one protocol against the same counterpart, create one row per protocol.

---

## Writing Conventions

- **Language:** English.
- **Format:** Markdown.
- **Punctuation:** Never use the em dash `—`. Use the hyphen `-` as a separator.
- **Names:** Service and entity names in Title Case when used as proper nouns (e.g., "the Customer Management service", the "Sale" entity). Use the exact same name across all documents.
- **Dates:** `YYYY-MM-DD` format.
- **Document versioning:** Start at `1.0`. Bump minor for content revisions, major for significant restructuring. The version line at the top of the document (`> Document version: X.Y` in blockquote form for Interactions.md, or a `Document version` row in the identification table for Functional Detail.md) is the only versioning artefact kept inside the document - **do not write per-update release notes** (e.g., `> This update: ...`, "What changed in this version", or any sentence describing the latest edit). The git history is the cumulative changelog; the document version number is the in-file fingerprint.
- **Analysis date:** Every modification to `Functional Detail.md` or `Functional Detail - Interactions.md` **must** also update the `Analysis date` field to the current date (`YYYY-MM-DD`) in **parallel with** the version bump. The field lives in the §1 Identification table for `Functional Detail.md` (`| **Analysis date** | YYYY-MM-DD |`) and as a blockquote line at the top for `Functional Detail - Interactions.md` (`> Analysis date: YYYY-MM-DD`, sitting alongside `> Document version: X.Y`). Both files must carry an `Analysis date` so a reader can tell at a glance when the document was last reviewed; the version number is the in-file fingerprint, the analysis date is the recency marker.
- **Markers:**
  - `[To confirm]` - information that could not be verified in the source code
  - `[TODO]` - section not yet filled in
  - `[N/A]` - not applicable (preferable to leaving blank)

---

## What Not to Include

These are functional documents - not technical specifications. Beyond the §2 Avoid rules and §Core Principles, do **not** include:

- Source code, pseudocode, class / ER / DB diagrams, endpoint listings (see §Core Principles - Business language first).
- Infrastructure configuration: CI/CD, Kubernetes, Docker, deployment model (see §2 Avoid - low-level jargon).
- Performance metrics, SLAs, or capacity data.
- Technical findings, defects, contradictions, improvements, opinions on code quality - all belong in `Analysis Report.md` (`technical-analysis` skill).

---

## Pre-completion Checklist

Before considering the functional analysis done, verify:

**Setup and outputs**
- [ ] `overview.md` was read at Phase 1 step 0; its ecosystem name, forbidden client list, vocabulary extensions are reflected in the output
- [ ] Both files (`Functional Detail.md` and `Functional Detail - Interactions.md`) exist and are up to date
- [ ] Every modified file had its `Document version` bumped and `Analysis date` updated; unchanged files keep both
- [ ] No per-update release-note sentence below the version line (see §Writing Conventions)
- [ ] All template sections are filled in or marked `[N/A]` with justification

**§1 - §2 (Identification + Summary)**
- [ ] `Business domain` matches the Controlled Vocabularies list (incl. project-specific categories)
- [ ] §2 follows the 2-or-3-paragraph + 4-8 bullets structure (see §Section Guidance §2)
- [ ] §2 Summary Evidence Checklist was produced (see §2 guidance); every claim traces to a code artefact, no `[To confirm]`, universal quantifiers were challenged, paragraph 3 dropped if it would force fabrications
- [ ] §2 contains no blocked adjectives, product/vendor/file names, low-level wiring terms, customer/tenant names, editorial verbs, repository meta-commentary, cryptographic/format internals (see §2 Avoid block)
- [ ] On a **review run**: §2 prose and `Main functionalities` were re-verified against current SKILL rules and current §3-§9 content, not carried over unchanged
- [ ] `Functional Overview.md` per-service section was synced verbatim to the current §2 (prose + bullets + `Document version`)

**§3 - §9 (body)**
- [ ] §3: feature count is 10-30 (or justified); each feature describes *what*, not *how*
- [ ] §3 ↔ §8: every constrained feature has `Associated limitations:`; every §8 entry traces to a §3 feature
- [ ] §4: lifecycle states copied verbatim from source enum (full list, source order)
- [ ] §5: operational modes (if any) are mapped to their controlling flag / branch; per-feature `Applicable in:` tags applied
- [ ] §7: contains only out-of-band artefacts (files, exports, scheduled extracts); events and API responses are elsewhere
- [ ] §8: filled candidly; mode-intended behaviour not recorded as defect; "absent" vs "exists but unused" distinguished; asymmetries verified both sides
- [ ] Code-native terminology used (specific field-device types, code term over paraphrase)
- [ ] All inline cross-refs (`see F-NNN`, `see §N`) re-verified after renumbering/splits

**§5-§6 of Interactions.md + diagrams**
- [ ] Integration Inventory was built; every diagram arrow and every 5.3-5.6 row traces to a code artefact (see §Integration Inventory)
- [ ] Mandatory cross-service sweep done for BOTH directions: §5.4 callers and §5.5/§5.6 event counterparts were resolved by searching the in-scope sibling repos (endpoint property + call site for sync; topic-value match + listener/publisher for events); `[To confirm]`/`[No caller found]` used only after the sweep found nothing. No integration added by analogy
- [ ] Bidirectional back-propagation done: every edge established/changed/removed in this run is reflected on BOTH services' Interactions docs (counterpart §5 tables, diagrams, and version updated); no edge left asymmetric
- [ ] Both diagrams exist as `.excalidraw` + freshly regenerated `.svg`, or are explicitly `[N/A]`; service names identical across both diagrams and across other services' documents

**Hygiene**
- [ ] No em dash `—` used; functional language only (no endpoint paths or method names); controlled vocabulary used for interaction type and protocol
- [ ] No `Analysis Report.md` content leaked into functional docs; cross-cutting rules appear once in §6, not duplicated
- [ ] At least one sibling service document was consulted for naming/granularity consistency
