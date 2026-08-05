# Commands - Comandos Personalizados

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

## Descrição

Esta pasta contém **comandos personalizados** (custom commands) para o Claude Code. Estes comandos encapsulam fluxos de trabalho complexos ou operações específicas que são executadas frequentemente, permitindo automação e padronização de tarefas repetitivas.

## Para Que Servem

Os comandos servem para:

1. **Automatizar fluxos complexos**: Encapsular sequências de ações que normalmente requerem múltiplos passos
2. **Padronizar operações**: Garantir que tarefas específicas sejam executadas sempre da mesma forma
3. **Simplificar uso**: Fornecer uma interface simples para operações que requerem conhecimento técnico detalhado
4. **Integrar com sistemas externos**: Facilitar interação com bancos de dados, APIs, túneis SSH, etc.

## Estrutura

Cada comando é um arquivo Markdown que descreve:
- **Quando usar** o comando
- **Como invocar** o comando (sintaxe)
- **Parâmetros** necessários
- **Comportamento** esperado
- **Pré-Transações** e dependências
- **Exemplos** de uso

## Comandos Disponíveis

Este projeto possui os seguintes comandos personalizados disponíveis:

### `/complete-development` — tronco (Transação → contrato API)

**Descrição**: Valida o Transação, clarifica, especifica, arquitetura de solução (3a–3c) e gera o contrato **OpenAPI (4api)**.

**Funcionalidade**: Tronco comum até o contrato de API; **não** executa arquitetura de implementação (4a), código nem testes. Ao terminar, o utilizador deve usar `/frontend-development` e/ou `/backend-development`.

**Uso**:
```
/complete-development <requisite-id>
```

**Quando usar**: Início do trabalho num Transação, até o contrato API estar definido.

---

### `/frontend-development` — track frontend

**Descrição**: Arquitetura frontend (4a), revisão de segurança da arquitetura (4b), UI/UX (4c), baseline opcional, **plano de testes + Robot + testes unitários**, implementação, loop (unitário + build + **E2E/flow** + segurança de código), rastreabilidade, documentação e segurança contextual.

**Pré-Transações**: Tronco completo até **4api**; scope frontend no `{tx-id}-technical-solution-transaction.md`.

**Uso**:
```
/frontend-development <requisite-id>
```

**Quando usar**: Implementação e testes **funcionais/E2E** da parte UI.

---

### `/backend-development` — track backend

**Descrição**: Arquitetura backend (4a), revisão de segurança (4b), baseline opcional, **apenas testes unitários (5d)** — sem plano Robot/funcional — implementação, loop (**7a → 7a2 → 7c**, sem 7b), rastreabilidade, documentação e segurança contextual.

**Pré-Transações**: Tronco completo até **4api**; scope backend no `{tx-id}-technical-solution-transaction.md`.

**Uso**:
```
/backend-development <requisite-id>
```

**Quando usar**: Implementação da API/serviços alinhados ao OpenAPI.

## Como Criar Novos Comandos

Para criar um novo comando personalizado:

1. **Crie um arquivo `.md`** na pasta `commands/`
2. **Nomeie seguindo o padrão**: `kebab-case.md` (ex: `meu-novo-comando.md`)
3. **Estruture o documento** com:
   - Título descritivo
   - Seção "Quando Usar Esta Skill/Comando"
   - Seção "Uso" com sintaxe
   - Seção "Parâmetros" detalhando cada parâmetro
   - Seção "Comportamento" explicando o que acontece
   - Seção "Pré-Transações" listando dependências
   - Seção "Exemplos" com casos de uso práticos
   - Seção "Tratamento de Erros" para casos de falha

4. **Documente claramente**:
   - Quando o comando deve ser invocado automaticamente
   - Quais parâmetros são obrigatórios vs opcionais
   - Qual o comportamento esperado
   - Como tratar erros e exceções

## Boas Práticas

1. **Nomes descritivos**: Use nomes que deixem claro o propósito do comando
2. **Documentação completa**: Inclua todos os detalhes necessários para uso correto
3. **Tratamento de erros**: Sempre documente como lidar com falhas
4. **Exemplos práticos**: Forneça exemplos reais de uso
5. **Validação de parâmetros**: Documente validações e formatos esperados

## Integração com Agentes

Os comandos podem ser usados por agentes durante seu trabalho:

- **Agentes podem invocar comandos**: Um agente pode usar um comando para executar uma tarefa específica
- **Comandos podem usar agentes**: Um comando pode delegar trabalho para agentes especializados
- **Comandos encapsulam fluxos**: Comandos podem orquestrar múltiplos agentes em sequência

## Referências

- **Agentes**: `.claude/agents/` - Agentes especializados que podem usar comandos, organizados em subpastas:
  - `backend/`, `frontend/`, `general/`, `tests/`, `security/` (com subpastas: `code/`, `supply-chain/`, `architecture/`, `infra-cloud/`, `runtime/`)
- **Skills**: `.claude/skills/` - Conhecimento técnico usado pelos comandos
- **Documentação**: `{{PATH_DOCS}}/` - Documentação de projetos e sistemas
- **Hooks**: `.claude/hooks/` - Scripts de automação relacionados

## Notas Importantes

- **Execução automática**: Alguns comandos podem ser projetados para serem invocados automaticamente quando detectam certas solicitações do usuário
- **Verificação de dependências**: Comandos devem verificar se ferramentas necessárias estão instaladas antes de tentar usá-las
- **Documentação**: Cada comando deve estar bem documentado com exemplos de uso
