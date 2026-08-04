# Skills - Conhecimento Tecnológico Especializado

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
├── angular/                    # Skills para Angular 18+
│   └── SKILL.md
├── dotnet/                     # Skills para .NET 8+
│   └── SKILL.md
├── java-spring-microservices/  # Skills para Spring Boot microserviços
│   └── SKILL.md
├── openapi/                    # Skills para especificações OpenAPI
│   └── SKILL.md
└── postgresql/                 # Skills para PostgreSQL
    └── SKILL.md
```

## Skills Disponíveis

### 1. **Angular** (`angular/SKILL.md`)

**Tecnologias**: Angular 18+, TypeScript, PrimeNG, NgRx, Jest, Playwright

**Conteúdo**:
- Stack tecnológico completo (Angular 18+, PrimeNG, NgRx, etc.)
- Padrões de componentes standalone
- State management com NgRx
- Autenticação OAuth2/OIDC com PKCE
- Testing com Jest e Playwright
- PWA configuration
- Design system integration
- Estrutura de pastas obrigatória
- Convenções de nomenclatura
- Bootstrap commands

**Quando usar**: Ao trabalhar com projetos Angular, criar componentes, implementar features frontend, configurar Angular.

### 2. **.NET** (`dotnet/SKILL.md`)

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

### 3. **Java Spring Microservices** (`java-spring-microservices/SKILL.md`)

**Tecnologias**: Java 11, Spring Boot 2.7.9

**Conteúdo**:
- Stack tecnológico (Java 11, Spring Boot)
- Padrões de microserviços
- Estrutura de projetos Spring Boot
- Convenções de nomenclatura
- Bootstrap commands

**Quando usar**: Ao trabalhar com microserviços Java Spring Boot.

### 4. **OpenAPI** (`openapi/SKILL.md`)

**Tecnologias**: OpenAPI 3.0, AsyncAPI 2.6.0

**Conteúdo**:
- Padrões de especificação OpenAPI
- Estrutura de arquivos YAML
- Schemas compartilhados
- Versionamento de APIs
- Convenções de nomenclatura
- Exemplos de especificações

**Quando usar**: Ao criar ou modificar especificações OpenAPI/AsyncAPI para APIs REST ou eventos.

### 5. **PostgreSQL** (`postgresql/SKILL.md`)

**Tecnologias**: PostgreSQL, Entity Framework Core, Npgsql

**Conteúdo**:
- Padrões de modelagem de banco de dados
- Mapeamento ORM (Entity Framework Core)
- Migrations e versionamento de schema
- Queries e performance
- Convenções de nomenclatura
- Índices e otimizações

**Quando usar**: Ao trabalhar com PostgreSQL, criar entidades, mapeamentos ORM, migrations.

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
1. Agente consulta `.claude/skills/dotnet/SKILL.md`
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

- **Backend agents** (`.claude/agents/backend/`): Consultam `dotnet/SKILL.md` ou `java-spring-microservices/SKILL.md`
- **Frontend agents** (`.claude/agents/frontend/`): Consultam `angular/SKILL.md`
- **API agents**: Consultam `openapi/SKILL.md`
- **Database agents**: Consultam `postgresql/SKILL.md`
- **Security agents** (`.claude/agents/security/`): Consultam uma ou mais skills conforme o tipo de revisão (código, dependências, arquitetura, IaC, runtime), por exemplo dotnet, angular, openapi, postgresql

Agentes seguem os padrões documentados nas skills para garantir consistência.

## Referências

- **Agents**: `.claude/agents/` - Agentes que usam estas skills
- **Documentação**: `.claude/docs/` - Documentação de projetos que seguem estes padrões
- **Examples**: `examples/` - Projetos exemplo que implementam estas skills
- **CLAUDE.md**: Documentação principal do repositório

## Notas Importantes

- **Versões específicas**: Skills documentam versões específicas de tecnologias - siga exatamente
- **Padrões obrigatórios**: Convenções marcadas como "REQUIRED" ou "MANDATORY" devem ser seguidas rigorosamente
- **Bootstrap commands**: Use os comandos fornecidos para garantir estrutura correta desde o início
- **Consistência**: Skills garantem consistência entre projetos que usam a mesma tecnologia
