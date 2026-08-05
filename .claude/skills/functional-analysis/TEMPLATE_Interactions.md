# Interactions - [Service Name]

---

## 5. Interactions with Other Internal Services

This section contains **two separate integration diagrams**: one for synchronous request/response interactions (REST, gRPC, SOAP, GraphQL) and one for event-driven interactions through a message broker (Solace, Kafka, AMQP, MQTT). Mixing both types in a single diagram hides the architectural shape of the service - keep them separate even when only one of the two applies (in that case, mark the unused diagram `[N/A]` with a one-line justification).

### 5.1. Synchronous Integration Diagram

Includes only synchronous request/response interactions: REST, gRPC, SOAP, GraphQL, and equivalent. Do **not** include events, broker traffic, or asynchronous queues here.

![Synchronous integration diagram](./sync-integration.svg)

Editable source: [sync-integration.excalidraw](./sync-integration.excalidraw) - open with Excalidraw (https://excalidraw.com) or the Excalidraw VS Code extension. Regenerate via the `excalidraw-diagram-generator` skill following the diagram rules in `functional-analysis/SKILL.md` (Sections 5.1 and 5.2 - Integration Diagrams); the generator writes both `sync-integration.excalidraw` and `sync-integration.svg` to disk, and the markdown link above stays valid because it is path-based. If the service has no synchronous integrations, mark this subsection `[N/A]` with a one-line justification and produce neither the `.excalidraw` nor the `.svg`.

### 5.2. Event-Driven Integration Diagram

Includes only event-driven interactions through a broker (Solace, Kafka, AMQP, MQTT, or equivalent). Do **not** include synchronous REST/gRPC/SOAP calls here. Use dashed arrows for publication and consumption.

![Event-driven integration diagram](./event-integration.svg)

Editable source: [event-integration.excalidraw](./event-integration.excalidraw) - open with Excalidraw (https://excalidraw.com) or the Excalidraw VS Code extension. Regenerate via the `excalidraw-diagram-generator` skill following the diagram rules in `functional-analysis/SKILL.md` (Sections 5.1 and 5.2 - Integration Diagrams); the generator writes both `event-integration.excalidraw` and `event-integration.svg` to disk, and the markdown link above stays valid because it is path-based. If the service has no event-driven integrations, mark this subsection `[N/A]` with a one-line justification and produce neither the `.excalidraw` nor the `.svg`.

### 5.3. Consumed Services (this service -> others)

Synchronous outgoing calls only. Event publications belong in section 5.5.

| Service | Functional purpose | Interaction type | Protocol / technology |
|---|---|---|---|
| `[name]` | `[e.g., "validate the buyer's eligibility for the product"]` | `[synchronous / asynchronous]` | `[e.g., REST / gRPC]` |

### 5.4. Consumer Services (others -> this service)

Synchronous incoming calls only. Event subscriptions on this service's events belong in section 5.5.

| Service | Functional purpose | Interaction type | Protocol / technology |
|---|---|---|---|
| `[name]` | `[e.g., "register a sale after validation"]` | `[synchronous / asynchronous]` | `[e.g., REST / gRPC]` |

### 5.5. Published Business Events

| Event | When it is emitted | Known consumers | Transport |
|---|---|---|---|
| `[e.g., SaleCompleted]` | `[when payment is confirmed]` | `[Billing, BI, Notifications]` | `[e.g., Solace / Kafka / AMQP]` |

### 5.6. Consumed Business Events

| Event | Source service | Purpose of the subscription | Transport |
|---|---|---|---|
| `[e.g., CustomerUpdated]` | `[Customer Management]` | `[keep local customer cache in sync]` | `[e.g., Solace / Kafka / AMQP]` |

---

## 6. External Integrations

| External system | Functional purpose | Interaction type | Protocol / technology | Criticality |
|---|---|---|---|---|
| `[e.g., Payment gateway X]` | `[process card payments]` | `[synchronous / asynchronous / event]` | `[e.g., REST / SOAP / SFTP]` | `[High / Medium / Low]` |
