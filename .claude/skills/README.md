# Skills - Conhecimento Tecnológico Especializado

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

## Descrição

Esta pasta contém **skills** (habilidades/conhecimento) especializado por tecnologia. Cada skill é um arquivo de documentação que define padrões, convenções, melhores práticas e configurações específicas para uma tecnologia ou framework particular.

## Para Que Servem

As skills servem para:

1. **Padronizar desenvolvimento**: Definir padrões consistentes para cada tecnologia
2. **Fornecer contexto técnico**: Documentar versões, bibliotecas e configurações específicas
3. **Guia de implementação**: Fornecer exemplos e templates para implementação
4. **Referência para agentes**: Permitir que agentes de IA consultem conhecimento técnico específico
5. **Onboarding**: Facilitar aprendizado de padrões do projeto para novas tecnologias

## Estrutura

```
skills/
├── README.md
│
│   ── Frontend ──────────────────────────────────────────────
├── frontend/
│   └── react/
│       └── SKILL.md
│
│   ── Backend ───────────────────────────────────────────────
├── backend/
│   ├── dotnet/
│   │   └── SKILL.md
│   ├── openapi/
│   │   └── SKILL.md
│   └── postgresql/
│       └── SKILL.md
│
│   ── Transações ────────────────────────────────────────────
├── validate-transaction/
│   └── SKILL.md
├── transaction-markdown/
│   └── SKILL.md
├── clarify-transaction/
│   └── SKILL.md
├── specify-transaction/
│   └── SKILL.md
├── analyse-transaction-rules/
│   └── SKILL.md
├── architect-transaction/
│   └── SKILL.md
├── generate-new-transactions/
│   └── SKILL.md
├── update-transaction-documentation/
│   └── SKILL.md
│
│   ── Design & Geração ──────────────────────────────────────
├── generate-technical-design/
│   └── SKILL.md
├── generate-technical-design-summary/
│   └── SKILL.md
├── generate-mockup/
│   └── SKILL.md
├── excalidraw-diagram-generator/
│   └── SKILL.md
├── draw-io/
│   └── SKILL.md
├── adjust-frontend-design/
│   └── SKILL.md
│
│   ── Testes ────────────────────────────────────────────────
├── create-test-plan/
│   └── SKILL.md
├── validate-test-plan-coverage/
│   └── SKILL.md
├── create-robot-functional-tests/
│   └── SKILL.md
├── unit-test-validation/
│   └── SKILL.md
├── e2e-flow-validation/
│   └── SKILL.md
│
│   ── Segurança ─────────────────────────────────────────────
├── architecture-security-review/
│   └── SKILL.md
├── contextual-security-review/
│   └── SKILL.md
├── code-security-validation/
│   └── SKILL.md
│
│   ── Infraestrutura ────────────────────────────────────────
├── design-infra-markdown/
│   ├── SKILL.md
│   ├── README.md
│   ├── templates/
│   │   ├── final-document.md
│   │   └── Transactions-questionnaire.md
│   └── examples/
│       ├── ADCU_19_0435 - Infrastructure Design Staging.md
│       ├── ADCU_19_0435 - Infrastructure Design Staging Checklist.md
│       └── MOBIE_26_xxxx - Infrastructure Design *.md  (12 files)
├── deployment-infra-terraform/
│   ├── SKILL.md
│   ├── templates/
│   │   ├── resource-manifest.template.json
│   │   ├── scaling-checklist.template.md
│   │   ├── gitignore.template
│   │   └── backends/
│   │       ├── gcs.tf, s3.tf, azurerm.tf
│   │       ├── ibm-cos.tf, oci.tf, salesforce.tf
│   │       ├── terraform-cloud.tf, http.tf
│   └── examples/
│       ├── resource-manifest.aws-webapp.example.json
│       └── scaling-checklist.example.md
├── deployment-infra-ansible/
│   ├── SKILL.md
│   ├── templates/
│   │   ├── config-manifest.template.json
│   │   └── gitignore.template
│   └── examples/
│       └── config-manifest.gcp-vms-dockerized.example.json
├── setup-azure-pipelines/
│   ├── SKILL.md
│   ├── prompts/
│   │   ├── agent-prompt-modular.md
│   │   └── agent-prompt-monolithic.md
│   ├── templates/
│   │   ├── main-pipeline.yaml
│   │   ├── monolithic/pipeline.yaml
│   │   ├── per-repo/
│   │   │   ├── build-pipeline.yaml
│   │   │   ├── build-pipeline-validation.yaml
│   │   │   ├── variables.yaml
│   │   │   └── variables-env.yaml
│   │   ├── sub/
│   │   │   ├── sub-pipeline-maven-ms.yaml
│   │   │   ├── sub-pipeline-maven-ms-verify.yaml
│   │   │   ├── sub-pipeline-angular-web.yaml
│   │   │   └── sub-pipeline-docker-infra.yaml
│   │   ├── infra/
│   │   │   ├── terraform-pipeline.yaml
│   │   │   ├── provision-pipeline.yaml
│   │   │   └── first-run-checklist.md
│   │   ├── variables/
│   │   │   ├── global.yaml, global-env.yaml
│   │   │   └── pools/global-pool.yaml
│   │   └── docs/
│   │       ├── variable-groups-modular.md
│   │       ├── variable-groups-monolithic.md
│   │       └── service-connections.md
│   └── examples/
│       └── modular-springboot-angular/
│           ├── README.md, first-run-checklist.md
│           ├── variable-groups.md, service-connections.md
│           ├── templates/  (shared pipeline templates)
│           └── repos/
│               ├── infra/Pipelines/
│               ├── ms-<service>/Pipelines/
│               └── web-<app>/Pipelines/
│
│   ── Workspace ─────────────────────────────────────────────
├── complete-development-tree/
│   ├── SKILL.md
│   └── templates/
│       └── manifest.md.tpl
├── generate-baseline/
│   └── SKILL.md
├── add-code-traceability/
│   └── SKILL.md
└── hollow-development/
    └── SKILL.md
```

## Skills Disponíveis

### Frontend

#### 1. **React** (`frontend/react/SKILL.md`)

**Tecnologias**: React 19+, TypeScript, Vite, React Router, Tailwind CSS, Vitest, Playwright

**Conteúdo**:
- Stack tecnológico completo (React 19+, Vite, React Router, etc.)
- Padrões de componentes funcionais com hooks
- State management (useState, useReducer, Context, Zustand/TanStack Query)
- Autenticação OAuth2/OIDC
- Testing com Vitest e Playwright
- Design system integration
- Estrutura de pastas obrigatória
- Convenções de nomenclatura
- Bootstrap commands

**Quando usar**: Ao trabalhar com projetos React, criar componentes, implementar features frontend, configurar React.

---

### Backend

#### 2. **.NET** (`backend/dotnet/SKILL.md`)

**Tecnologias**: .NET 8+, ASP.NET Core, Entity Framework Core, CQRS, Clean Architecture

**Conteúdo**:
- Stack tecnológico (.NET 8+, EF Core, MediatR, FluentValidation)
- Clean Architecture (API → Application → Domain → Infrastructure)
- CQRS com MediatR
- Repository Pattern
- Convenções de nomenclatura obrigatórias
- Padrões de validação (FluentValidation)
- Mapeamento DTOs (AutoMapper)
- Estrutura de pastas Clean Architecture
- Bootstrap commands
- Containerization (Docker/Podman)
- Testing (xUnit, Moq, TestContainers)

**Quando usar**: Ao trabalhar com projetos .NET, implementar APIs REST, criar domain entities, configurar repositórios.

#### 3. **OpenAPI** (`backend/openapi/SKILL.md`)

**Tecnologias**: OpenAPI 3.0, AsyncAPI 2.6.0

**Conteúdo**:
- Padrões de especificação OpenAPI
- Estrutura de arquivos YAML
- Schemas compartilhados
- Versionamento de APIs
- Convenções de nomenclatura
- Exemplos de especificações

**Quando usar**: Ao criar ou modificar especificações OpenAPI/AsyncAPI para APIs REST ou eventos.

#### 4. **PostgreSQL** (`backend/postgresql/SKILL.md`)

**Tecnologias**: PostgreSQL, Entity Framework Core, Npgsql

**Conteúdo**:
- Padrões de modelagem de banco de dados
- Mapeamento ORM (Entity Framework Core)
- Migrations e versionamento de schema
- Queries e performance
- Convenções de nomenclatura
- Índices e otimizações

**Quando usar**: Ao trabalhar com PostgreSQL, criar entidades, mapeamentos ORM, migrations.

---

### Transações

#### 5. **Validate Transaction** (`validate-transaction/SKILL.md`)

**Quando usar**: Antes de iniciar qualquer fluxo de clarificação ou especificação — valida se o documento de Transação está bem delimitado, é implementável, testável e rastreável. Sugere divisões no formato `RQ_XXX_01`, `RQ_XXX_NN` quando o Transação é demasiado amplo.

#### 6. **Transaction Markdown** (`transaction-markdown/SKILL.md`)

**Quando usar**: Ao criar ou atualizar documentos de Transação em Markdown com estrutura funcional e orientada ao negócio (Título, Descrição, Fonte, Ações, Pré/Pós-condições, Entradas, Saídas, Regras de Negócio, Dependências, CRUD). Exclui detalhes de implementação técnica.

#### 7. **Clarify Transaction** (`clarify-transaction/SKILL.md`)

**Quando usar**: Para executar o modo CLARIFY do product-owner — analisa documentos de Transação, levanta questões e riscos, e regista clarificações em `{{PATH_DOCS}}/4-implementation/development/{tx-id}/`. Corresponde ao passo 1 do fluxo `complete-development`.

#### 8. **Specify Transaction** (`specify-transaction/SKILL.md`)

**Quando usar**: Para executar o modo SPECIFY do product-owner — lê o Transação e as clarificações e produz `{tx-id}-complete-transaction.md` em `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/`. Corresponde ao passo 3 do fluxo `complete-development`.

#### 9. **Analyse Transaction Rules** (`analyse-transaction-rules/SKILL.md`)

**Quando usar**: Para classificar regras de negócio como privadas ou partilhadas, consolidar as partilhadas num Business Rule Catalog em .claude/rules/`, atribuir identificadores únicos `BR-XXX`, e atualizar os Transações para referenciar esses identificadores.

#### 10. **Architect Transaction** (`architect-transaction/SKILL.md`)

**Quando usar**: Para gerar a especificação técnica (`{tx-id}-backend-tech-spec.md` e/ou `{tx-id}-frontend-tech-spec.md`) a partir do `{tx-id}-technical-solution-transaction.md`. Corresponde ao passo **4a** nos fluxos `frontend-development` e `backend-development`. Invoca backend-architect ou frontend-architect conforme o scope do Transação.

#### 11. **Generate New Transactions** (`generate-new-transactions/SKILL.md`)

**Quando usar**: Ao pedir para **gerar a lista de Transações**, **explodir a FS em ficheiros de Transação (TX-*.md)**, ou **criar arquivos de Transação** a partir de uma Functional Specification. Gera um ficheiro Markdown por Transação com estrutura híbrida (template transaction-markdown + secções Traceability e Acceptance Criteria).

**Inputs típicos**: caminho da FS (obrigatório); opcionalmente pasta de output, subset de TX-IDs, idioma. **Output por omissão**: um `<TX-ID>.md` por Transação em `{{PATH_DOCS}}/4-implementation/development/<TX-ID>-<slug>/`.

#### 12. **Update Transaction Documentation** (`update-transaction-documentation/SKILL.md`)

**Quando usar**: Para validar se a documentação (BR, RQ, specs) corresponde ao comportamento implementado da aplicação e atualizar a documentação do projeto (README, architecture docs, API docs). Corresponde ao passo **9** nos fluxos `frontend-development` e `backend-development`. Ignorar quando `features.test` é `false` em `settings.json`.

---

### Design & Geração

#### 13. **Generate Technical Design** (`generate-technical-design/SKILL.md`)

**Quando usar**: Ao pedir um documento de design técnico, TDD (em sentido de arquitetura), ou TD derivado da especificação funcional do projeto. Gera um único ficheiro Markdown de Technical Design a partir de uma Functional Specification (`architecture/Functional-Specification_*.md`), com rastreabilidade a TX-, TX-, BR-, NTI-, SCR-, FEAT-.

**Inputs típicos**: caminho da FS; opcionalmente NFRs, OpenAPI, ADRs. **Output por omissão**: `Technical-Design_<InitiativeSlug>_v1.md` no mesmo diretório da FS.

#### 14. **Generate Technical Design Summary** (`generate-technical-design-summary/SKILL.md`)

**Quando usar**: Ao pedir um resumo do design técnico, gerar documento Word formatado a partir de um TD, ou criar diagrama de arquitetura a partir de um documento de design técnico existente. Gera três artefactos: ficheiro Markdown de resumo, diagrama Excalidraw (`.excalidraw` + `.png`), e documento Word (`.docx`).

**Inputs típicos**: caminho do TD Markdown (obrigatório); caminho do `.docx` template (obrigatório); opcionalmente pasta de output, ficheiros de payload de API.

#### 15. **Generate Mockup** (`generate-mockup/SKILL.md`)

**Quando usar**: Ao criar mockups/protótipos visuais para Transações, visualizar features antes da implementação, gerar ecrãs HTML de referência para a equipa. Gera mockups HTML standalone com sistema de anotações que mapeia elementos UI a Transações (RQ) e business rules (BR). Suporta múltiplas fontes de design (Figma, design system tokens, screenshots).

#### 16. **Excalidraw Diagram Generator** (`excalidraw-diagram-generator/SKILL.md`)

**Quando usar**: Ao pedir para criar diagramas (flowcharts, arquitectura de sistemas, mapas mentais, diagramas de relações, swimlanes, DFDs, class diagrams) a partir de descrições em linguagem natural. Produz ficheiros `.excalidraw` que podem ser abertos diretamente no Excalidraw.

#### 17. **Draw.io** (`draw-io/SKILL.md`)

**Quando usar**: Para criar, editar ou converter diagramas `.drawio` — ajuste de layout, uso de ícones AWS, configuração de fontes para slides Quarto, ou conversão para PNG. Edita exclusivamente ficheiros `.drawio`; não edita `.drawio.png` diretamente.

#### 18. **Adjust Frontend Design** (`adjust-frontend-design/SKILL.md`)

**Quando usar**: Para ajustar `{tx-id}-frontend-tech-spec.md` com orientações de layout e design (fonts, botões, cores, constraints) antes da implementação pelo developer. Corresponde ao passo **4c** no fluxo `frontend-development`. Executar apenas quando existe scope frontend.

---

### Testes

#### 19. **Create Test Plan** (`create-test-plan/SKILL.md`)

**Quando usar**: Para criar planos de teste em Robot Framework (`.robot`) a partir do Transação completo e specs. Corresponde ao passo **5** no fluxo `frontend-development`. Output por omissão em `tests/TestPlan/`. Não utilizado em `backend-development`.

#### 20. **Validate Test Plan Coverage** (`validate-test-plan-coverage/SKILL.md`)

**Quando usar**: Para validar que um plano de teste (`.robot` em `TestPlan/`) cobre 100% da funcionalidade descrita nos documentos de Transação (TX-*, BR-*, ações, pré/pós-condições). Corresponde ao passo **5b** no fluxo `frontend-development`. Se cobertura < 100%, retorna ao passo 5 para ajuste.

#### 21. **Create Robot Functional Tests** (`create-robot-functional-tests/SKILL.md`)

**Quando usar**: Para criar ficheiros Robot Framework (`.robot`) no repositório `functional-tests`, organizados por Transação (`web/TX-XXX/`). Corresponde ao passo **5c** no fluxo `frontend-development`. Não utilizado em `backend-development`.

#### 22. **Unit Test Validation** (`unit-test-validation/SKILL.md`)

**Quando usar**: Para **gerar** testes unitários em modo TDD (passo **5d**) a partir da tech-spec antes da implementação, ou para **executar e validar** testes unitários existentes (passo **7a**). Utilizado nos fluxos `frontend-development` e `backend-development`. Ignorar quando `features.test` é `false` em `settings.json`.

#### 23. **E2E Flow Validation** (`e2e-flow-validation/SKILL.md`)

**Quando usar**: Para executar testes E2E e de fluxo (Playwright via flow-test, e `.robot` via robot-tester). Corresponde ao passo **7b** no fluxo `frontend-development`. Valida navegação entre ecrãs, execução dos `.robot` em `TestPlan/`, e conformidade do layout com a tech-spec. Não utilizado em `backend-development`.

---

### Segurança

#### 24. **Architecture Security Review** (`architecture-security-review/SKILL.md`)

**Quando usar**: Para rever a especificação técnica do ponto de vista de segurança: threat modeling (STRIDE), superfície de ataque e trust boundaries. Corresponde ao passo **4b** nos fluxos `frontend-development` e `backend-development`, após o passo 4a (Architect). Ignorar quando `features.security` é `false` em `settings.json`.

#### 25. **Contextual Security Review** (`contextual-security-review/SKILL.md`)

**Quando usar**: Para invocar agentes de segurança contextuais (autenticação, cloud/IaC, runtime, supply chain) com base no scope da feature. Corresponde ao passo **10** nos fluxos `frontend-development` e `backend-development`, após o passo 9. Ignorar quando `features.security` é `false` em `settings.json`.

#### 26. **Code Security Validation** (`code-security-validation/SKILL.md`)

**Quando usar**: Para validar o código da feature em termos de segurança: análise estática (`static-analysis-enforcer`) e revisão assistida (`code-security-auditor`). Corresponde ao passo **7c** nos fluxos `frontend-development` e `backend-development`. Produz Security Findings Report quando existem falhas Critical/High. Ignorar quando `features.security` é `false` em `settings.json`.

---

### Infraestrutura

#### 27. **Design Infra Markdown** (`design-infra-markdown/SKILL.md`)

**Quando usar**: Quando o utilizador pede para desenhar, documentar, planear ou gerar infraestrutura (GCP, AWS, Azure, on-prem, híbrido), ou para converter Transações de infraestrutura num documento estruturado. Gere o ciclo completo: recolha de Transações, confirmação, geração do documento, iteração e revisão.

#### 28. **Deployment Infra Terraform** (`deployment-infra-terraform/SKILL.md`)

**Quando usar**: Para gerar, criar, modificar ou escalar um projeto Terraform a partir de um documento de design de infraestrutura. Orquestra dois agentes em sequência: `infra-terraform-extractor` (extrai manifest) e `infra-terraform-coder` (implementa o projeto em `./infra/deployment/terraform/`).

#### 29. **Deployment Infra Ansible** (`deployment-infra-ansible/SKILL.md`)

**Quando usar**: Para gerar ou configurar um projeto Ansible que configura e faz deploy de aplicações em infraestrutura provisionada por Terraform. Orquestra dois agentes em sequência: `infra-ansible-extractor` (lê state/plan Terraform e produz `config-manifest.json`) e `infra-ansible-coder` (implementa o projeto em `./infra/deployment/ansible/`).

#### 30. **Setup Azure Pipelines** (`setup-azure-pipelines/SKILL.md`)

**Quando usar**: Para gerar pipelines CI/CD Azure DevOps — ficheiros YAML de pipeline, documentos de referência de variable groups e service connections. Invoca o agente `azure-pipelines-engineer`.

---

### Workspace

#### 31. **Complete Development Tree** (`complete-development-tree/SKILL.md`)

**Quando usar**: Para orquestrar `/complete-development` em múltiplos Transações em paralelo usando git worktrees, respeitando uma árvore de dependências pai→filho. Invocado por `/complete-development-tree`. Processa Transações por níveis topológicos (filhos aguardam pais), cria worktrees isoladas por `(Transaction, project)` e persiste estado num manifest para retoma.

#### 32. **Generate Baseline** (`generate-baseline/SKILL.md`)

**Quando usar**: Para criar um projeto base/scaffold numa tecnologia específica (ex: React, .NET). O agente consulta a skill correspondente em `.claude/skills/` e segue as instruções de bootstrap/setup.

#### 33. **Add Code Traceability** (`add-code-traceability/SKILL.md`)

**Quando usar**: Para adicionar tags de rastreabilidade de Transações (TX-XXX, BR-*) ao código gerado. Corresponde ao passo **8** nos fluxos `frontend-development` e `backend-development`, após todos os testes e validações de segurança passarem. Invoca o agente `code-tagger`.

#### 34. **Worktree Docker** (`worktree-docker/SKILL.md`)

**Tipo**: Skill de gestão de stack Docker isolada por worktree de transação

**Conteúdo**:
- Gere uma stack Docker Compose isolada para os worktrees de uma TX/NTI (`TX-003`, `NTI-002`, …) criados por `/complete-development-tree`
- Produz um **override layer** (`docker-compose.override.yml`, `.env`, opcionalmente `frontend-config.json`, e um `README.md`) em `{{WORKTREES_PATH}}/_compose/<TX>/` que se funde com o `setup/local/docker-compose.yml` de cada projeto: renomeia containers (prefixo `<tx-id-lower>_`), remapeia portas (offset +100 por defeito ou via `--port-offset`), substitui a rede `myapp_shared` por `<tx-id-lower>_shared`
- **Modos**: `(default)` gerar + validar · `--up` gerar + arrancar com smoke-check · `--stop`/`--down` parar mantendo volumes · `--destroy`/`--down-v` parar + apagar volumes + remover `_compose/<TX>/` (confirma sem `--force`; **não toca** nos worktrees git) · `--status`/`--ps` · `--logs [svc...]`
- **Coexistência**: várias stacks de worktree e a stack principal podem correr em simultâneo — cada uma usa o seu próprio nome de projeto, prefixo de container, rede e gama de portas

**Quando usar**: Ao pedir para **criar/arrancar/parar/destruir uma stack Docker por worktree**, ou quando o utilizador disser "cria um docker para esta worktree", "stop o docker do TX-003", "apaga o docker do NTI-002", etc.

**Inputs típicos**: TX/NTI id (obrigatório); opcionalmente mode flag, `--port-offset`, `--project`, `--force`. **Output por omissão**: `{{WORKTREES_PATH}}/_compose/<TX>/{docker-compose.override.yml,.env,frontend-config.json,README.md}` + (no modo `--up`) containers `<tx-id-lower>_*` em execução. Skill-companheira de `complete-development-tree` (que cria os próprios worktrees).

#### 35. **Hollow Development** (`hollow-development/SKILL.md`)

**Quando usar**: Para implementar **um único** artefacto (SCR, TX ou NTI) do catálogo `{{PATH_DOCS}}/1-analysis/artefacts/` de ponta a ponta — resolve o artefacto (uma camada de referências), gera uma implementação mínima mas real, gera apenas os testes do tipo desse artefacto, e corre a revisão de segurança já existente (`code-security-validation`). Alternativa rápida e sem cerimónia ao `complete-development`/`complete-development-tree`: sem clarificações, sem arquitetura, sem `{id}-complete-transaction.md`. Para (não implementa) se o artefacto for BI/BR/DE/EV, ou se o skeleton do projeto alvo não existir (nesse caso indica `generate-baseline`). Funciona com qualquer catálogo/projeto — não assume entidades, campos ou stack específicos.

**Inputs típicos**: `<artefact-id>` (obrigatório), invocado como `/hollow-development <artefact-id>`. **Output por omissão**: código de implementação + testes nas árvores reais `backend/`/`frontend/` do projeto detetado, seguindo a skill de stack correspondente.

## Formato dos Arquivos

Cada skill é um arquivo Markdown com frontmatter YAML:

```yaml
---
name: nome-da-skill
description: Descrição breve da skill e quando usar
---
```

Seguido por seções detalhadas:

1. **Technology Stack**: Versões, bibliotecas, ferramentas
2. **Architecture & Patterns**: Padrões arquiteturais específicos
3. **Naming Conventions**: Convenções obrigatórias de nomenclatura
4. **Code Quality Standards**: Padrões de qualidade de código
5. **Project Bootstrap & Setup**: Comandos para criar novos projetos
6. **Required Folder Structure**: Estrutura de pastas obrigatória
7. **Required Configuration**: Configurações obrigatórias
8. **Testing Strategy**: Estratégias de teste
9. **Best Practices**: Melhores práticas específicas da tecnologia

## Como Usar Skills

### Para Desenvolvedores

1. **Consulte antes de começar**: Leia a skill relevante antes de iniciar trabalho em uma tecnologia
2. **Siga os padrões**: Use as convenções e padrões documentados
3. **Use bootstrap commands**: Utilize os comandos fornecidos para criar novos projetos
4. **Mantenha atualizado**: Atualize skills quando padrões mudarem

### Para Agentes de IA

1. **Referência automática**: Agentes consultam skills automaticamente quando trabalham com tecnologias específicas
2. **Padrões consistentes**: Skills garantem que agentes sigam os mesmos padrões
3. **Contexto técnico**: Skills fornecem contexto técnico necessário para implementação

### Exemplo de Uso

Quando um agente backend trabalha com .NET:
1. Agente consulta `.claude/skills/backend/dotnet/SKILL.md`
2. Obtém informações sobre Clean Architecture, CQRS, convenções
3. Implementa código seguindo os padrões documentados
4. Usa estrutura de pastas e nomenclatura conforme a skill

## Manutenção

### Quando Atualizar

- ✅ **Nova versão de tecnologia** → Atualizar versões na skill
- ✅ **Nova biblioteca adotada** → Adicionar à stack tecnológica
- ✅ **Mudança de padrão** → Atualizar seções relevantes
- ✅ **Novo padrão identificado** → Adicionar à skill
- ✅ **Mudança de convenção** → Atualizar convenções de nomenclatura

### Criar Nova Skill

Para criar uma nova skill:

1. **Crie pasta** em `skills/` com nome descritivo (ex: `react/`)
2. **Crie arquivo** `SKILL.md` na pasta
3. **Adicione frontmatter** YAML com nome e descrição
4. **Estruture** seguindo o padrão das skills existentes:
   - Technology Stack
   - Architecture & Patterns
   - Naming Conventions
   - Code Quality Standards
   - Project Bootstrap & Setup
   - Required Folder Structure
   - Required Configuration
   - Testing Strategy
   - Best Practices
5. **Documente completamente** todos os aspectos da tecnologia
6. **Adicione exemplos** práticos e comandos bootstrap

## Boas Práticas

1. **Específico e detalhado**: Skills devem ser específicas e detalhadas o suficiente para guiar implementação
2. **Atualizado**: Manter skills atualizadas com versões e padrões atuais
3. **Exemplos práticos**: Incluir exemplos de código e comandos práticos
4. **Bootstrap commands**: Fornecer comandos prontos para criar novos projetos
5. **Estrutura obrigatória**: Definir claramente estrutura de pastas e arquivos obrigatórios

## Integração com Agentes

Skills são consultadas automaticamente por agentes:

- **Backend agents** (`.claude/agents/backend/`): Consultam `backend/dotnet/SKILL.md`
- **Frontend agents** (`.claude/agents/frontend/`): Consultam `frontend/react/SKILL.md`
- **API agents**: Consultam `backend/openapi/SKILL.md`
- **Database agents**: Consultam `backend/postgresql/SKILL.md`
- **Security agents** (`.claude/agents/security/`): Consultam `architecture-security-review` (step 4b), `code-security-validation` (step 7c) e `contextual-security-review` (step 10)
- **Design agents** (`.claude/agents/design/`): Invocados pela skill `design-infra-markdown`
- **Deployment agents** (`.claude/agents/deployment/`): Invocados pelas skills `deployment-infra-terraform` e `deployment-infra-ansible`
- **Setup agents** (`.claude/agents/setup/`): Invocados pela skill `setup-azure-pipelines`

Agentes seguem os padrões documentados nas skills para garantir consistência.

## Referências

- **Agents**: `.claude/agents/` - Agentes que usam estas skills
- **Documentação**: `{{PATH_DOCS}}/` - Documentação de projetos que seguem estes padrões
- **Examples**: `examples/` - Projetos exemplo que implementam estas skills
- **CLAUDE.md**: Documentação principal do repositório

## Notas Importantes

- **Versões específicas**: Skills documentam versões específicas de tecnologias - siga exatamente
- **Padrões obrigatórios**: Convenções marcadas como "REQUIRED" ou "MANDATORY" devem ser seguidas rigorosamente
- **Bootstrap commands**: Use os comandos fornecidos para garantir estrutura correta desde o início
- **Consistência**: Skills garantem consistência entre projetos que usam a mesma tecnologia
