# [Service Name]

---

## 1. Identification

| Field | Value |
|---|---|
| **Service name** | `[e.g., Sales Manager — use the service's own name, never a paraphrase like "Sales Management"]` |
| **Business domain** | `[one of: Base Libraries | Core Microservices | Operational Microservices | Management Microservices | Platform & Integration Services | Development and Testing | Applications and Portals | Tools and Utilities | Legacy Modules - plus any project-specific category declared in overview.md (e.g. Ticketing Microservices for this codebase). See Controlled Vocabularies in SKILL.md]` |
| **Purpose** | `[2-3 lines: why this service exists, what business problem it solves]` |
| **Repository** | `[URL or path]` |
| **Analysis date** | `[YYYY-MM-DD]` |
| **Analysis author** | `Claude (automated analysis)` |
| **Document version** | `[e.g., 1.0]` |

---

## 2. Summary

[Opening paragraph - business outcome / value proposition. Lead with the concrete problem solved or outcome delivered, framing the service as the engine, settlement layer, platform, etc. behind a commercial result. State the breadth of coverage in plain terms.]

[Middle paragraph - technical depth and differentiators. Use selected architectural keywords (real-time event streams, parallel calculation engine, asynchronous pipeline, versioned configurations, multi-channel processing, state machine, weighted distribution, commission hierarchy) that signal credibility. Translate the architecture into commercial differentiators: speed, scale, fairness, transparency, compliance, multi-channel coverage. Do NOT name products, vendors, files, or low-level wiring (MongoDB, Solace, Kafka, queue, topic, webhook, endpoint, REST API).]

[Closing paragraph - governance, lifecycle, and outputs. Describe the operator-facing controls, audit features, configurability, and tangible outputs (reports, documents, events). Frame these as governance and traceability guarantees that finance, audit, and compliance teams require.]

**Main functionalities:**

- [Capability theme 1]
- [Capability theme 2]
- [Capability theme 3]
- [Capability theme 4]

---

## 3. Capabilities and Features

### 3.1. [Canonical service name or domain noun — e.g., "Shift Manager", "Infraction Control" — never a paraphrase like "Shift Management"]

#### F-001 · [Feature name]

- **Description:** `[in business language, 1-3 lines]`
- **Relevant inputs:** `[from a business perspective - e.g., "customer data, selected product, payment method"]`
- **Relevant outputs:** `[e.g., "issued ticket, receipt, SaleCompleted event"]`
- **Associated business rules:** `[e.g., "Maximum Transaction Limit, Eligibility Validation, Discount Policy X"]`
- **Notes:** `[optional - relevant observations]`

#### F-002 · [Feature name]

- **Description:** `[...]`
- **Relevant inputs:** `[...]`
- **Relevant outputs:** `[...]`
- **Associated business rules:** `[...]`
- **Notes:** `[...]`

### 3.2. [Subdomain / Capability B]

#### F-003 · [Feature name]

- **Description:** `[...]`
- **Relevant inputs:** `[...]`
- **Relevant outputs:** `[...]`
- **Associated business rules:** `[...]`
- **Notes:** `[...]`

---

## 4. Business Entities

### 4.1. Entities the service *owns*

| Entity | Description | States / lifecycle |
|---|---|---|
| `[e.g., Sale]` | `[brief description]` | `[e.g., Initiated -> Paid -> Issued -> Refunded / Cancelled]` |

### 4.2. Entities consulted / referenced (from other services)

| Entity | Owner service | Purpose of the consultation |
|---|---|---|
| `[e.g., Customer]` | `[Customer Management]` | `[e.g., validate eligibility for product]` |

> **Interactions and external integrations** are documented in the companion file: `Functional Detail - Interactions.md`.

---

## 5. Configurability and Variations

### 5.1. Configurable per customer / operator

`[e.g., fare table, available products, texts and languages, discount rules, transaction limits]`

### 5.2. Requires development to change

`[e.g., adding a new payment method, new product type, integration with a new external system]`

### 5.3. Conditional / customer-specific features

| Feature | Customer(s) / context | Notes |
|---|---|---|
| `[...]` | `[...]` | `[...]` |

---

## 6. Cross-Cutting Business Rules and Policies

- **`[Policy name]`:** `[description]`
- **`[...]`**

---

## 7. Reports, Exports and Data Made Available

| Output | Description | Destination / consumer | Frequency |
|---|---|---|---|
| `[e.g., Daily sales report]` | `[totals by channel and product]` | `[internal BI]` | `[daily]` |

---

## 8. Known Limitations and Functional Gaps

- `[e.g., Does not support partial refunds - only full refunds]`
- `[e.g., Discount policy is not configurable - any change requires development]`

---

## 9. Additional Notes

`[Any relevant context not covered above - notable technical debt, known plans, people dependencies, etc.]`

---

## Appendix A - Glossary of Domain-Specific Terms

| Term | Meaning |
|---|---|
| `[...]` | `[...]` |
