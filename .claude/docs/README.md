# Docs - Documentação do Projeto

## Descrição

Esta pasta contém a **documentação do projeto**. É um repositório de conhecimento que serve como fonte única de verdade para documentação técnica, arquitetura, padrões e guias do projeto.

## Para Que Servem

A documentação serve para:

1. **Referência técnica**: Fornecer informações detalhadas sobre o projeto
2. **Onboarding**: Facilitar a integração de novos desenvolvedores ao projeto
3. **Padronização**: Documentar padrões arquiteturais e de desenvolvimento
4. **Rastreabilidade**: Manter histórico de requisitos, especificações técnicas e implementações
5. **Contexto para IA**: Fornecer contexto estruturado para agentes de IA trabalharem com o código

## Estrutura

Esta pasta contém documentação do projeto. A estrutura pode variar conforme a organização do projeto. Atualmente esta pasta contém apenas este README.md.

Para projetos maiores, a estrutura típica pode incluir:

```
docs/
├── architecture/          # Documentação arquitetural
│   ├── dependencies.md    # Mapa de dependências entre projetos
│   └── shared-patterns.md # Padrões compartilhados do ecossistema
├── guides/                # Guias práticos
│   ├── getting-started.md # Setup inicial do ambiente
│   └── common-tasks.md    # Tarefas comuns de desenvolvimento
├── projects/              # Documentação de projetos individuais
│   ├── _TEMPLATE.md      # Template para novos projetos
│   └── [projetos]/       # Documentação de cada projeto
├── requirements/         # Requisitos e especificações
│   └── RQ-*/            # Requisitos numerados
│       ├── RQ-*.md      # Documentação do requisito
│       ├── RQ-*-clarifications.md  # Esclarecimentos do requisito
│       └── tests/       # Artefatos de teste (gerados por agentes)
│           ├── flows/   # Testes de fluxo de navegação
│           ├── reqs-check/  # Validação de documentação
│           ├── TestPlan/  # Planos de teste Robot Framework (.robot)
│           ├── investigations/  # Investigação de falhas
│           └── manual-reports/  # Relatórios de teste manual
└── overview.md           # Visão geral do projeto
```

## Organização da Documentação

A documentação pode ser organizada de diferentes formas conforme a necessidade do projeto. Algumas estruturas comuns incluem:

### Estruturas Comuns

1. **Por tipo de conteúdo**:
   - `architecture/` - Documentação arquitetural
   - `guides/` - Guias práticos
   - `api/` - Documentação de APIs
   - `deployment/` - Guias de deploy

2. **Por funcionalidade**:
   - `features/` - Documentação de features
   - `modules/` - Documentação de módulos
   - `components/` - Documentação de componentes

3. **Por fase do projeto**:
   - `requirements/` - Requisitos e especificações
     - `requirements/{requirement_id}/` - Documentação de cada requisito
     - `requirements/{requirement_id}/tests/` - Artefatos de teste gerados pelos agentes de teste
   - `design/` - Documentação de design
   - `implementation/` - Notas de implementação

### Arquivos Comuns

- **`overview.md`**: Visão geral do projeto
- **`getting-started.md`**: Guia de início rápido
- **`architecture.md`**: Documentação arquitetural
- **`api.md`**: Documentação de APIs
- **`deployment.md`**: Guias de deploy

## Como Usar Esta Documentação

### Para Desenvolvedores

1. **Explore a estrutura**: Navegue pela pasta `docs/` para entender como a documentação está organizada
2. **Comece pelo overview**: Procure por arquivos como `overview.md` ou `README.md` para entender o projeto
3. **Consulte guias**: Procure por pastas `guides/` ou arquivos de setup para começar
4. **Siga padrões**: Consulte documentação arquitetural para entender padrões do projeto
5. **Mantenha atualizado**: Adicione documentação conforme o projeto evolui

### Para Agentes de IA

1. **Índice principal**: Consulte `.claude/project-knowledge.md` (se existir) para encontrar documentação
2. **Busca por conteúdo**: Use ferramentas Read/Grep para encontrar documentação relevante
3. **Estrutura de pastas**: Explore a estrutura de pastas para entender organização
4. **Padrões**: Consulte documentação arquitetural para padrões do projeto
5. **Cite fontes**: Sempre cite os arquivos consultados nas respostas

## Manutenção da Documentação

### Quando Atualizar

- ✅ **Nova feature adicionada** → Documentar funcionalidade
- ✅ **Mudança arquitetural** → Atualizar documentação arquitetural
- ✅ **Nova API criada** → Adicionar documentação de API
- ✅ **Mudança de dependências** → Atualizar documentação de dependências
- ✅ **Novo requisito** → Documentar requisito e implementação
- ✅ **Testes executados** → Artefatos de teste são salvos automaticamente em `requirements/{requirement_id}/tests/`
- ✅ **Bug resolvido** → Documentar solução (se relevante)

### Boas Práticas

- **Mantenha atualizado**: Documentação desatualizada é pior que nenhuma documentação
- **Seja claro e conciso**: Documentação deve ser fácil de entender
- **Use exemplos**: Exemplos práticos ajudam muito
- **Organize logicamente**: Estruture a documentação de forma lógica
- **Versionamento**: Considere versionar documentação importante

## Características Importantes

### Documentação-Driven Development

Este projeto pode seguir uma abordagem **documentação-first**:

1. **Consulte documentação** antes de responder questões sobre o projeto
2. **Leia documentos relevantes** usando a ferramenta Read antes de responder
3. **Cite fontes** nas respostas (ex: `docs/architecture.md:45`)

### Contexto Automático

O hook `session-start.sh` em `.claude/hooks/` (se configurado) pode injetar automaticamente referências a esta documentação no início de cada sessão do Claude Code.

## Estrutura de Requirements e Testes

**Glossário de pastas**: `requirement_id` nos caminhos abaixo designa a pasta do requisito no filesystem. Esse nome corresponde ao **`req-id-name`**: nome completo da pasta sob `.claude/docs/requirements/` (ex.: `RQ-001-criar-tarefa`), o mesmo placeholder usado pelos agentes (backend-architect, flow-test, flow-test-logger, etc.). Não confundir com o ID curto (ex.: `RQ-001`) usado só em títulos ou campos de relatório.

Os requisitos são organizados em `requirements/{requirement_id}/` e incluem:

- **Documentação do requisito**: `RQ-*.md` e `RQ-*-clarifications.md`
- **Artefatos de teste**: `requirements/{requirement_id}/tests/` contém:
  - `flows/` - Relatórios e screenshots de testes de fluxo de navegação (gerado por `@flow-test`)
  - `reqs-check/` - Relatórios de validação de documentação (gerado por `@req-checker`)
  - `TestPlan/` - Arquivos `.robot` com planos de teste Robot Framework (gerado por `@test-plan`)
  - `investigations/` - Relatórios de investigação de falhas (gerado por `@flow-test-logger`)
  - `robot-reports/` - Relatórios de teste Robot Framework com screenshots e logs (gerado por `@robot-tester`)

Os agentes de teste criam automaticamente a estrutura de diretórios se ela não existir.

## Referências

- **Project Knowledge**: `.claude/project-knowledge.md` - Índice mestre de toda documentação
- **CLAUDE.md**: Documentação principal do repositório
- **Agents**: `.claude/agents/` - Agentes que usam esta documentação, organizados por categoria:
  - **Backend**: `.claude/agents/backend/` - backend-developer, backend-architect, backend-code-reviewer, api-specialist
  - **Frontend**: `.claude/agents/frontend/` - frontend-engineer, frontend-architect, frontend-code-reviewer, ui-ux-designer
  - **General**: `.claude/agents/general/` - product-owner, code-tagger
  - **Test Agents**: `.claude/agents/tests/` - req-checker, flow-test, test-plan, flow-test-logger, unit-test-generator, robot-tester (geram artefatos em `requirements/{requirement_id}/tests/`)
  - **Security**: `.claude/agents/security/` - Agentes de segurança por camada (usados quando necessários; nos fluxos **frontend-development** e **backend-development**, os de código estão integrados como passo **7c** quando `--no-security` não é usado):
    - `security/code/` - code-security-auditor, static-analysis-enforcer (**obrigatórios** no loop de desenvolvimento)
    - `security/supply-chain/` - dependency-vuln-scanner, supply-chain-guardian, secrets-auditor (quando fizer sentido)
    - `security/architecture/` - security-architect, auth-security-specialist (contextuais)
    - `security/infra-cloud/` - cloud-security-reviewer (quando IaC alterado)
    - `security/runtime/` - runtime-security-tester (quando aplicável)
- **Skills**: `.claude/skills/` - Skills que referenciam padrões documentados

## Links Úteis

Adicione aqui links externos relevantes para o projeto, como:
- Repositório do projeto
- Documentação externa
- Ferramentas e serviços utilizados
- Wiki ou documentação adicional
