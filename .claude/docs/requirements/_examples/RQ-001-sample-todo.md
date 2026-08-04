# Requisito — Gestão de Tarefas (Todo)

## Descrição

Permitir ao utilizador criar, editar, listar e pesquisar tarefas (Todo) na aplicação, através da interface (frontend), com persistência no servidor (backend). O utilizador pode criar novas tarefas definindo os atributos principais (com dados persistidos no backend e estado inicial automático), editar tarefas existentes com integridade da informação e registo da última modificação, e visualizar e pesquisar tarefas registadas mediante critérios como estado, prioridade e data limite.

## Papéis

- Utilizador

## Ações

- Solicitar criação de nova tarefa, preencher formulário, definir prioridade e data limite e submeter dados
- Na lista, selecionar uma tarefa e editar os seus dados (título, descrição, prioridade, data limite) e guardar alterações
- Visualizar a lista de tarefas, aplicar filtros (estado, prioridade, data) e limpar filtros

## Ecrãs

### Lista de Tarefas

- Clicar no botão **Nova Tarefa** para criar
- Clicar no ícone de edição para editar uma tarefa
- Selecionar filtros (estado, prioridade, datas), clicar em **Pesquisar** ou em **Limpar**

### Criar Tarefa

- Preencher Título
- Preencher Descrição (opcional)
- Selecionar Prioridade
- Selecionar Data Limite
- Clicar em Guardar

### Editar Tarefa

- Alterar Título, Descrição, Prioridade, Data Limite
- Clicar em Guardar

## Eventos

- Clique em Nova Tarefa
- Clique em Guardar (criar ou editar)
- Clique no ícone de edição
- Carregamento do ecrã da lista
- Aplicação ou limpeza de filtros

## Pré-condições

- Para editar: tarefa existente

## Pós-condições

- **Criar**: tarefa persistida no backend, identificador único atribuído, estado inicial *Pendente*, interface atualizada com o resultado, mensagem de sucesso
- **Editar**: dados atualizados no backend, data de modificação atualizada, interface refletindo as alterações, mensagem de sucesso
- **Listar/Pesquisar**: lista apresentada conforme dados obtidos do backend e filtros aplicados

## Dados Obrigatórios

- **Criar e editar**: Título, Prioridade
- **Filtros**: nenhum

## Formato dos Dados

- Título: texto livre (máx. 150 caracteres)
- Descrição: texto livre (máx. 1000 caracteres)
- Prioridade: Baixa | Média | Alta
- Data Limite: AAAA-MM-DD
- Estado: Pendente | Concluída
- Datas em filtros: AAAA-MM-DD

## Integrações

- Frontend e backend: comunicação para criação, edição, listagem e pesquisa de tarefas (por exemplo API exposta pelo backend), com persistência dos dados no servidor

## Regras de Negócio

- O título é obrigatório na criação e na edição
- Todas as tarefas novas iniciam no estado *Pendente*
- Apenas tarefas *Pendentes* ou *Concluídas* podem ser editadas
- Sem filtros aplicados, todas as tarefas registadas devem ser apresentadas na lista
