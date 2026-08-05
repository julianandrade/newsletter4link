# Infrastructure Design – Requirements Questionnaire

| | |
| --- | --- |
| **Document Title:** | Infrastructure Design Requirements Questionnaire |
| **Template Version:** | 1.0 |
| **Date:** | {{QUESTIONNAIRE_DATE}} |
| **Language:** | {{LANGUAGE}} |
| **Linked Document:** | {{LINKED_DOCUMENT}} |
| **Purpose:** | Collect all technical and business requirements needed to produce the Infrastructure Design document. Complete all sections before the architecture design session. |

---

> **Instructions:** Fill in each answer directly below its question. Mark questions `[REQUIRED]` as mandatory before proceeding to design. Mark `[OPTIONAL]` questions as needed. Use the **Answer:** line below each question to record the response. Leave unanswered items blank — they will be flagged to the user after generation and recorded in Section 12 of this document. The final document's *Questions and Clarifications* section is always left empty for the client to fill in.

---

## 1. Project & Document Metadata

*This information populates the Document Control section and cover page of the final design document.*

- [ ] **[REQUIRED]** What is the Project ID / reference number?
  **Answer:**

- [ ] **[REQUIRED]** What is the full Project Title / name of the initiative?
  **Answer:**

- [ ] **[REQUIRED]** What is the Client / Customer name?
  **Answer:**

- [ ] **[REQUIRED]** Who is the author of this design document (name and role)?
  **Answer:**

- [ ] **[REQUIRED]** What is the target document version (e.g., 1.0)?
  **Answer:**

- [ ] **[REQUIRED]** What is the expected document date?
  **Answer:**

- [ ] **[REQUIRED]** What is the information classification level? *(e.g., Public, Internal, Restricted, Confidential)*
  **Answer:**

---

## 2. Project Scope & Participants

*This information populates the Project Scope section, including the objectives and the stakeholders table.*

### 2.1 Project Overview

- [ ] **[REQUIRED]** Briefly describe the purpose of this infrastructure setup. What system or platform will it support?
  **Answer:**

- [ ] **[REQUIRED]** List all software components / products to be installed as part of this project.
  *Example: Kubernetes cluster, PostgreSQL, Kong API Gateway, NGINX, Solace event broker, monitoring stack.*
  **Answer:**

- [ ] **[REQUIRED]** Which deployment environments are in scope?
  *Select all that apply: Development / Staging/Quality / Production. If there are additional environments, list them.*
  **Answer:**

- [ ] **[OPTIONAL]** Is a separate document describing the Development environment being produced, or is it included here?
  **Answer:**

### 2.2 Participants

- [ ] **[REQUIRED]** Who is the Link Consulting Project Manager? Provide name and email.
  **Answer:**

- [ ] **[REQUIRED]** Who is the Link Consulting Technical Lead / Infrastructure Specialist? Provide name and email.
  **Answer:**

- [ ] **[REQUIRED]** Who are the key contacts on the client side? For each contact, provide: name, role, phone, and email.
  **Answer:**

---

## 3. Installation Pre-Requirements

*This information populates the Installation Pre-Requirements section, covering team access, database, network, and hardware setup expectations.*

### 3.1 Team & Access

- [ ] **[REQUIRED]** Will the client provision the hardware/virtual machines and OS, or will Link be responsible?
  **Answer:**

- [ ] **[REQUIRED]** Does the Link team require VPN access to the client's network? If yes, who is responsible for provisioning it?
  **Answer:**

- [ ] **[REQUIRED]** Does the Link team require SSH/root access to all project machines?
  **Answer:**

- [ ] **[OPTIONAL]** Are there any specific access restrictions or approval processes for remote access?
  **Answer:**

### 3.2 Database Pre-Requirements

- [ ] **[REQUIRED]** Which database product(s) will be used as the main database engine(s)?
  *Example: PostgreSQL 15, MongoDB 7, Oracle Database 19c.*
  **Answer:**

- [ ] **[OPTIONAL]** Will the database installation and configuration be performed by Link or the client?
  **Answer:**

- [ ] **[OPTIONAL]** Are there specific storage volume or network configuration constraints for the database servers?
  **Answer:**

### 3.3 Network Pre-Requirements

- [ ] **[REQUIRED]** Must all servers have internet access (for downloading packages and software)?
  **Answer:**

- [ ] **[REQUIRED]** Will all FQDNs and IP addresses be registered in the DNS by the client before installation begins?
  **Answer:**

- [ ] **[OPTIONAL]** Are there any inter-environment connectivity restrictions? *(e.g., DEV cannot reach PRD)*
  **Answer:**

### 3.4 Hardware Pre-Requirements

- [ ] **[REQUIRED]** Will the infrastructure use virtual servers in the cloud, on-premises hardware, or a hybrid?
  **Answer:**

- [ ] **[REQUIRED]** Cloud provider, if applicable. *(e.g., AWS, Azure, GCP, OCI, on-premises VMware)*
  **Answer:**

- [ ] **[OPTIONAL]** Are there any constraints on the cloud region or data residency?
  **Answer:**

---

## 4. Software Products

*This information populates the Software Products section, including the OS configuration and the software list table.*

### 4.1 Operating System

- [ ] **[REQUIRED]** Which OS distribution and version will be used on all virtual machines?
  *Example: Ubuntu 22.04 LTS, RHEL 9, Amazon Linux 2023.*
  **Answer:**

- [ ] **[OPTIONAL]** Are there mandatory OS packages or system dependencies that must be pre-installed?
  *Example: curl, wget, nfs-utils, docker, containerd.*
  **Answer:**

- [ ] **[OPTIONAL]** Should a specific filesystem layout / mount point structure be used?
  *If yes, list mount points with their recommended sizes. Leave blank to use the default layout from the template.*
  **Answer:**

### 4.2 Software Component Details

*For each software component listed in section 2.1, provide the following. Copy the block as needed.*

**Component:**
- [ ] **[REQUIRED]** Component name and version to install:
  **Answer:**
- [ ] **[REQUIRED]** Brief description of its role in the architecture:
  **Answer:**
- [ ] **[OPTIONAL]** Licensing model or edition (Community / Enterprise / Cloud-managed):
  **Answer:**

---

## 5. Physical Architecture

*This information drives the Layer Architecture and Network Architecture diagrams in the final document.*

### 5.1 Architecture Layers

- [ ] **[REQUIRED]** Describe the high-level architecture tiers. Does the solution follow a standard layered model?
  *Example: Web Tier → DMZ (Load Balancer, SFTP) → Application Tier (Kubernetes) → Database Tier.*
  **Answer:**

- [ ] **[REQUIRED]** Will a Load Balancer be used? If yes, is it hardware or software (e.g., NGINX, HAProxy, cloud-native LB)?
  **Answer:**

- [ ] **[REQUIRED]** Will a DMZ be present? What components will live in the DMZ?
  *Example: Load Balancer, SFTP/Jump server, Reverse Proxy.*
  **Answer:**

- [ ] **[REQUIRED]** Will a Kubernetes cluster be used for the Application Tier?
  **Answer:**

- [ ] **[OPTIONAL]** Is a Service Mesh required? *(e.g., Istio, Linkerd)*
  **Answer:**

- [ ] **[OPTIONAL]** Will there be an API Gateway? If yes, which product?
  *Example: Kong, AWS API Gateway, NGINX.*
  **Answer:**

- [ ] **[OPTIONAL]** Will there be a Message / Event Broker? If yes, which product?
  *Example: Solace, Apache Kafka, RabbitMQ.*
  **Answer:**

- [ ] **[OPTIONAL]** Will there be an SFTP or Jump Server? In which environment(s)?
  **Answer:**

- [ ] **[OPTIONAL]** Will there be a dedicated Reverse Proxy node outside Kubernetes? If yes, which product?
  *Example: NGINX, Apache HTTP Server.*
  **Answer:**

### 5.2 Network Architecture Overview

- [ ] **[REQUIRED]** Will the network be segmented into subnets per tier? *(DMZ, Application, Database)*
  **Answer:**

- [ ] **[REQUIRED]** Will a VPN Gateway be required? If yes, who connects via VPN?
  *Example: developers, system administrators, third-party integrations.*
  **Answer:**

- [ ] **[OPTIONAL]** Will a Firewall appliance be explicitly modelled in the architecture?
  **Answer:**

---

## 6. Logical Architecture – Per Environment

*This information populates the Logical Architecture section. Fill in the sub-sections for each environment in scope.*

> **Naming convention used in diagrams:** Prefix = P (Production), Q (Staging/Quality), D (Development). Server types: K = Kubernetes Worker Node, DB = Database, FTP = SFTP, RP = Reverse Proxy.

### 6.1 Production Environment

#### Kubernetes Cluster

- [ ] **[REQUIRED]** How many Kubernetes worker nodes are required for Production?
  **Answer:**

- [ ] **[REQUIRED]** What are the vCPU and RAM specifications for each Production Kubernetes worker node?
  *Example: 8 vCPU, 32 GB RAM.*
  **Answer:**

- [ ] **[REQUIRED]** What is the local storage size for each Production Kubernetes worker node?
  *Example: 200 GB.*
  **Answer:**

- [ ] **[OPTIONAL]** Should worker nodes be distributed across multiple fault domains / availability zones?
  **Answer:**

#### Database Layer

- [ ] **[REQUIRED]** How many database server instances are required for Production? List each with its engine type.
  *Example: PDB1 – PostgreSQL primary, PDB2 – PostgreSQL replica.*
  **Answer:**

- [ ] **[REQUIRED]** What are the vCPU, RAM, and block storage specifications for each Production database server?
  **Answer:**

#### Other Servers (SFTP, Reverse Proxy)

- [ ] **[OPTIONAL]** Is an SFTP server required for Production? If yes, what are the specs? *(vCPU, RAM, disk)*
  **Answer:**

- [ ] **[OPTIONAL]** Is a Reverse Proxy server required for Production? If yes, what are the specs? *(vCPU, RAM, disk)*
  **Answer:**

---

### 6.2 Staging / Quality Environment

#### Kubernetes Cluster

- [ ] **[REQUIRED]** How many Kubernetes worker nodes are required for Staging/Quality?
  **Answer:**

- [ ] **[REQUIRED]** What are the vCPU and RAM specifications for each Staging Kubernetes worker node?
  **Answer:**

- [ ] **[REQUIRED]** What is the local storage size for each Staging Kubernetes worker node?
  **Answer:**

#### Database Layer

- [ ] **[REQUIRED]** How many database server instances are required for Staging? List each with its engine type.
  **Answer:**

- [ ] **[REQUIRED]** What are the vCPU, RAM, and block storage specifications for each Staging database server?
  **Answer:**

#### Other Servers (SFTP, Reverse Proxy)

- [ ] **[OPTIONAL]** Is an SFTP server required for Staging? If yes, what are the specs?
  **Answer:**

- [ ] **[OPTIONAL]** Is a Reverse Proxy server required for Staging? If yes, what are the specs?
  **Answer:**

---

### 6.3 Development Environment

#### Kubernetes Cluster

- [ ] **[REQUIRED]** How many Kubernetes worker nodes are required for Development?
  **Answer:**

- [ ] **[REQUIRED]** What are the vCPU and RAM specifications for each Development Kubernetes worker node?
  **Answer:**

- [ ] **[REQUIRED]** What is the local storage size for each Development Kubernetes worker node?
  **Answer:**

#### Database Layer

- [ ] **[REQUIRED]** How many database server instances are required for Development? List each with its engine type.
  *Note: Development typically uses a single server hosting multiple DB engines.*
  **Answer:**

- [ ] **[REQUIRED]** What are the vCPU, RAM, and block storage specifications for the Development database server(s)?
  **Answer:**

---

## 7. Security and Network

*This information populates the Security and Network section: server roles & ports, naming convention, management network, and per-environment network configurations.*

### 7.1 Server Roles & Ports

- [ ] **[REQUIRED]** For each server type in the solution, list the network ports that must be open.
  *Example: PostgreSQL – 5432 (TCP inbound from App Subnet), NGINX – 80/443 (TCP inbound from DMZ).*
  **Answer:**

### 7.2 Server Naming Convention

- [ ] **[OPTIONAL]** Is the standard Link Consulting naming convention acceptable?
  *Default pattern: `M-{ENV}-{TYPE}{NN}` — e.g., `M-PRD-DB01`. If a different convention is required, describe it.*
  **Answer:**

### 7.3 Management Network

- [ ] **[REQUIRED]** Should a separate Management VLAN/subnet be configured for SSH and admin console access?
  **Answer:**

- [ ] **[REQUIRED]** How will system administrators access the management network?
  *Example: VPN access to management VLAN, dedicated Jump Server.*
  **Answer:**

- [ ] **[OPTIONAL]** Should connectivity between environments (DEV ↔ STG ↔ PRD) be allowed at the management network level?
  **Answer:**

### 7.4 Production Network Configuration

- [ ] **[REQUIRED]** What is the VCN/VPC CIDR range for Production?
  *Example: 10.201.0.0/16.*
  **Answer:**

- [ ] **[REQUIRED]** What are the subnet CIDR ranges for each network segment in Production?
  *Provide: DMZ Subnet, Application Subnet, Database Subnet.*
  **Answer:**

- [ ] **[OPTIONAL]** What are the FQDNs and IP addresses for each Production server?
  *List as: ServerName – FQDN – IP. Use "Auto" if assigned by cloud provider.*
  **Answer:**

- [ ] **[OPTIONAL]** What are the Load Balancer / VIP front-end DNS names and IPs for Production?
  **Answer:**

- [ ] **[OPTIONAL]** What is the Primary DNS server IP for Production?
  **Answer:**

- [ ] **[OPTIONAL]** What is the NTP server address for Production?
  **Answer:**

- [ ] **[OPTIONAL]** List all firewall rules required for Production.
  *For each rule: Application/Management context – Source IP – Target IP:Port(s).*
  **Answer:**

### 7.5 Staging / Quality Network Configuration

- [ ] **[REQUIRED]** What is the VCN/VPC CIDR range for Staging/Quality?
  *Example: 10.101.0.0/16.*
  **Answer:**

- [ ] **[REQUIRED]** What are the subnet CIDR ranges for each network segment in Staging?
  *Provide: DMZ Subnet, Application Subnet, Database Subnet.*
  **Answer:**

- [ ] **[OPTIONAL]** What are the FQDNs and IP addresses for each Staging server?
  **Answer:**

- [ ] **[OPTIONAL]** What are the Load Balancer / VIP configurations for Staging?
  **Answer:**

- [ ] **[OPTIONAL]** What is the Primary DNS server IP for Staging?
  **Answer:**

- [ ] **[OPTIONAL]** What is the NTP server address for Staging?
  **Answer:**

- [ ] **[OPTIONAL]** List all firewall rules required for Staging.
  **Answer:**

### 7.6 Development Network Configuration

- [ ] **[REQUIRED]** What is the VCN/VPC CIDR range for Development?
  *Example: 10.1.0.0/16.*
  **Answer:**

- [ ] **[REQUIRED]** What are the subnet CIDR ranges for each network segment in Development?
  *Provide: DMZ Subnet, Application Subnet, Database Subnet.*
  **Answer:**

- [ ] **[OPTIONAL]** What are the FQDNs and IP addresses for each Development server?
  **Answer:**

- [ ] **[OPTIONAL]** What are the Load Balancer / VIP configurations for Development?
  **Answer:**

- [ ] **[OPTIONAL]** What is the Primary DNS server IP for Development?
  **Answer:**

- [ ] **[OPTIONAL]** What is the NTP server address for Development?
  **Answer:**

- [ ] **[OPTIONAL]** List all firewall rules required for Development.
  **Answer:**

---

## 8. High Availability & Disaster Recovery

*This information informs the architecture decisions for redundancy, failover, and recovery.*

- [ ] **[REQUIRED]** What is the target uptime SLA for the Production environment?
  *Example: 99.9%, 99.95%, 99.99%.*
  **Answer:**

- [ ] **[REQUIRED]** What is the acceptable Recovery Time Objective (RTO)?
  *Example: < 1 hour, < 4 hours.*
  **Answer:**

- [ ] **[REQUIRED]** What is the acceptable Recovery Point Objective (RPO)?
  *Example: < 15 minutes, < 1 hour.*
  **Answer:**

- [ ] **[OPTIONAL]** Is multi-region or multi-availability-zone deployment required?
  **Answer:**

- [ ] **[OPTIONAL]** What is the database backup strategy and retention policy?
  *Example: daily full backups retained for 30 days, WAL archiving for point-in-time recovery.*
  **Answer:**

---

## 9. Observability & Monitoring

*This information populates monitoring and alerting references in the design.*

- [ ] **[REQUIRED]** Which monitoring and metrics stack will be used?
  *Example: Prometheus + Grafana, Datadog, Azure Monitor, AWS CloudWatch.*
  **Answer:**

- [ ] **[OPTIONAL]** Which log aggregation tool will be used?
  *Example: ELK Stack (Elasticsearch, Logstash, Kibana), Loki, Splunk.*
  **Answer:**

- [ ] **[OPTIONAL]** Is distributed tracing required? If yes, which tool?
  *Example: Jaeger, Zipkin, OpenTelemetry.*
  **Answer:**

- [ ] **[OPTIONAL]** Is there an alerting / on-call management tool already in use?
  *Example: PagerDuty, Opsgenie, VictorOps.*
  **Answer:**

---

## 10. Security & Compliance

*This information feeds the security considerations section of the final design.*

- [ ] **[OPTIONAL]** Are there regulatory or compliance requirements that apply?
  *Example: GDPR, HIPAA, PCI-DSS, SOC 2, ISO 27001.*
  **Answer:**

- [ ] **[OPTIONAL]** What Identity and Access Management (IAM) approach will be used?
  *Example: Keycloak, Azure AD / Entra ID, AWS IAM, LDAP.*
  **Answer:**

- [ ] **[OPTIONAL]** What are the encryption requirements?
  *Example: TLS 1.2+ in transit, AES-256 at rest for database volumes.*
  **Answer:**

- [ ] **[OPTIONAL]** Will a Web Application Firewall (WAF) or DDoS protection be required?
  **Answer:**

- [ ] **[OPTIONAL]** Are there any audit logging or SIEM requirements?
  **Answer:**

---

## 11. Related Documents & References

*This information populates the Related Documents and Attachments sections.*

- [ ] **[OPTIONAL]** List any existing documents relevant to this infrastructure design.
  *For each: Document ID, Document Name, Date, Description.*
  **Answer:**

- [ ] **[OPTIONAL]** Are there architecture decision records (ADRs) or previous design documents to reference?
  **Answer:**

- [ ] **[OPTIONAL]** Are there any attachments (spreadsheets, diagrams, contracts) to include as references?
  **Answer:**

---

## 12. Open Questions & Pending Items

*Record any items that could not be answered during this questionnaire session. These will be preserved in this requirements file and reported to the user after the document is generated. The final document's Questions and Clarifications section is always left empty for the client to fill in.*

| # | Question / Pending Item | Raised By | Target Respondent | Due Date |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## Next Steps

Once this questionnaire is completed:

1. **Review completeness** — Ensure all `[REQUIRED]` items are answered. Flag any gaps as open questions in Section 12.
2. **Schedule Architecture Design Review** — Share the completed questionnaire with the infrastructure team and client stakeholders before the design session.
3. **Generate the Infrastructure Design Document** — Hand this completed questionnaire to the `infra-design-architect` agent to produce the structured design document following the `final-document.md` template.
4. **Iterate** — After the first draft, review open questions with the client and update the document accordingly.
5. **Obtain Approvals** — Route the final document through the Document Approvals process before the installation phase begins.
