# Requisitos — Definição e Critérios

Este documento define **o que é um requisito** neste repositório e **quando um requisito deve ser quebrado em vários**, para validar o escopo antes e durante o fluxo de desenvolvimento (**complete-development** tronco, **frontend-development** / **backend-development**, product-owner).

## Definição de requisito

**Requisito** é uma **entrega de valor** bem delimitada que:

1. **Pode ser implementada e testada de forma independente** (com dependências explícitas de outros requisitos, quando houver).
2. **Corresponde a um comportamento observável** pelo utilizador ou pelo sistema (ex.: criar tarefa, editar tarefa, listar e filtrar tarefas).
3. **É rastreável**: é possível apontar código, PR e testes que o atendem.
4. **Está documentada** no formato do projeto: `{req-id}.md` na pasta do requisito, com clarificações e `{req-id}-complete-requirement.md` quando aplicável.

**Validação**: Se o texto descreve um tema amplo (ex.: "sistema de tarefas") ou várias entregas distintas sem fronteira clara, **não** é um único requisito — deve ser dividido ou reescrito.

---

## Critérios para quebrar em vários requisitos

Use estes critérios para decidir se o conteúdo de um `{req-id}.md` deve ser **dividido em dois ou mais requisitos**. A decisão sobre camadas de stack (backend/frontend) é feita depois pelos arquitectos no momento adequado; **não** use camada técnica como critério de quebra aqui.

### 1. Um objetivo de utilizador por requisito

- Se o texto descreve **dois ou mais objetivos de utilizador** distintos (ex.: "criar tarefa" e "enviar notificação ao criador"), considere **dois ou mais requisitos**.
- Cada requisito deve responder a uma pergunta única do tipo: "O utilizador consegue fazer X?"

### 2. Testabilidade e ciclo de desenvolvimento

- Se um único requisito gera **tracks** (frontend/backend) com **muitos cenários** (.robot), **loop 7 muito longo** ou **escopo de segurança (7c) desproporcional**, considere dividir em requisitos menores.
- Um requisito deve ser dimensionado de forma a que o loop Developer ↔ Testes ↔ Segurança seja viável (ex.: até o limite de iterações definido no comando).

### 3. Reuso e dependência explícita

- Se uma parte do texto é **base** (ex.: "listar tarefas") e outra é **ação sobre essa base** (ex.: "filtrar tarefas"), pode ser um único requisito "listar e filtrar" ou dois requisitos com **dependência explícita** (ex.: RQ-003 listar, RQ-004 filtrar; RQ-004 depende de RQ-003).
- Quando houver dependência entre requisitos, ela deve constar em **System Dependencies** / **Dependencies** no documento do requisito.

### 4. Tamanho e entregabilidade

- Um requisito deve ser **entregável** num ciclo completo (clarify → specify → architect → develop → test → security) sem se tornar um "megarequisito".
- Se não for possível definir **critérios de aceitação testáveis** e delimitados para o texto atual, considere quebrar até que cada parte tenha aceitação clara.

### O que não usar como critério de quebra

- **Camadas de stack (backend vs frontend)**: a divisão por camada é decisão dos arquitectos (backend-architect, frontend-architect) no passo **4a** de **frontend-development** / **backend-development**. Um requisito pode abranger várias camadas; a quebra por stack não é feita aqui.

---

## Convenção de divisão de requisitos

Quando um requisito precisar ser **dividido em mais de um**, os novos requisitos devem ser identificados assim:

- **Identificadores**: `RQ-XXX_01`, `RQ-XXX_02`, …, `RQ-XXX_NN` (hífen no id base; underscore antes do subnúmero; zero à esquerda conforme necessário; ex.: RQ-001_01, RQ-001_02).
- **Estrutura de pastas**: A pasta pai mantém o id original. Cada requisito resultante da divisão é uma subpasta com seu identificador, contendo o documento do requisito:

```
.claude/docs/requirements/
└── RQ-001/
    ├── RQ-001_01/
    │   └── RQ-001_01.md
    ├── RQ-001_02/
    │   └── RQ-001_02.md
    └── RQ-001_0N/
        └── RQ-001_0N.md
```

- **Reportar ao utilizador**: Ao sugerir uma divisão, o agente deve indicar explicitamente esta estrutura. O utilizador deve criar estas subpastas e ficheiros antes do fluxo poder prosseguir.
- **Permissão para clarificar**: antes de prosseguir com a clarificação de **cada um** dos requisitos resultantes da divisão, o agente deve **pedir permissão ao utilizador**. Só após o utilizador autorizar é que se executa o passo Clarify (product-owner) para esse requisito. Isto aplica-se tanto no **complete-development** (passo 0 → sugestão de divisão; depois, para cada RQ-XXX_NN, pedir permissão e então executar passo 1) como no product-owner quando sugere a divisão.

---

## Anti-padrões (não é um requisito válido quando)

- **Várias entregas num único RQ**: o conteúdo equivale a vários PRs ou várias funcionalidades independentes sem fronteira clara.
- **Tema em vez de entrega**: o texto descreve um tema ou área (ex.: "melhorias no módulo de tarefas") em vez de um comportamento observável e testável.
- **Mistura refatoração + feature sem foco**: a feature não está claramente descrita e testável; o requisito vira um misto de "fazer várias coisas".
- **Sem critérios de aceitação**: não é possível listar acceptance criteria testáveis para o que está escrito.

---

## Uso da definição no fluxo

- **Complete-development (passo 0 — Validar requisito)**: Antes do passo 1 (Clarify), o agente lê o documento do requisito e este README; verifica se o conteúdo se qualifica como **um** requisito segundo a definição e se **não** viola os critérios de quebra (ou seja, não deveria ser dividido). Se não se qualificar ou devesse ser quebrado, o agente **interrompe** e reporta ao utilizador com sugestão de divisão e **estrutura de pastas** `RQ-XXX/RQ-XXX_01/RQ-XXX_01.md`, `RQ-XXX/RQ-XXX_02/RQ-XXX_02.md`, etc. (ver secção "Convenção de divisão de requisitos"). Para cada requisito resultante da divisão, o agente deve **pedir permissão ao utilizador** antes de prosseguir com a clarificação desse requisito.
- **Product-owner (CLARIFY)**: Ao analisar o ficheiro do requisito, o product-owner verifica **escopo**: o conteúdo cobre mais de um objetivo de utilizador ou fere os critérios de tamanho/entregabilidade? Se sim, deve **sugerir a divisão** no formato RQ-XXX_01, RQ-XXX_02, RQ-XXX_NN com a estrutura de pastas indicada e que será necessário **pedir permissão para prosseguir com a clarificação de cada um** (e, se apropriado, incluir perguntas nas clarificações sobre como o stakeholder prefere dividir).

Referência dos comandos: `.claude/commands/complete-development.md` (tronco), `.claude/commands/frontend-development.md`, `.claude/commands/backend-development.md`.  
Referência do agente: `.claude/agents/general/product-owner.md`.
