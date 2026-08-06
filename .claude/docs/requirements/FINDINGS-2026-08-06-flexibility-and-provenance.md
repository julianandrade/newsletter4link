# Rigidez da edição, datas e proveniência: o que existe, o que falta, e onde está o defeito

Levantamento feito a 6 de Agosto de 2026, a pedido do Julian, a partir de quatro queixas
suas: a UI/UX do ciclo de curadoria, a fixidez do "this week", a ausência de datas nos
metadados e no template, e a proveniência dos artigos que entram por newsletter.

Método: leitura do código, mais verificação visual com Playwright no harness
`/radar-preview` a 1440px e a 390px. Nada foi alterado. O detector mecânico do skill de
design correu sobre `components/proposal`, `app/dashboard/send`, `app/dashboard/page.tsx` e
`components/radar` e devolveu zero achados.

> Avaliação corrida em contexto único, não em dois avaliadores isolados. A instrução de
> sessão proíbe invocar subagentes sem pedido explícito.

---

## A conclusão que interessa primeiro

**A camada visual não é o problema.** Os ecrãs são específicos deste produto e bem
executados: o serif editorial nos títulos, o medidor de score, o selo de fonte, o ocre
usado com parcimónia, os estados de erro com retry e as recusas explicadas por extenso.
Nada disto sai de um template. O detector não encontrou um único achado.

O que se sente como "não gosto da UI/UX" é **o modelo de dados a aparecer à superfície**.
Três decisões de esquema estão a produzir toda a rigidez de que te queixas:

1. `Edition` é identificada por `week` + `year` e por mais nada, com um índice único que
   proíbe uma segunda edição na mesma semana.
2. `ArticleStatus` tem três valores e nenhum deles é um rascunho ou um "pronto mas não
   para esta semana".
3. `Article` não tem relação com nada: nem com a `RSSSource`, nem com o `InboundEmail` de
   onde veio. A origem é uma string de URL.

Enquanto estas três não mudarem, qualquer trabalho na UI é decoração em cima de um
modelo que não permite o que queres fazer.

---

## Pontuação, heurísticas de Nielsen

Superfície de modo **Operate**: o visitante vem completar uma tarefa.

| # | Heurística | Nota | Achado principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | Banda de colecção, razão da corrida, contagens e pipeline são exemplares. Zero visibilidade sobre os emails recebidos |
| 2 | Sistema e mundo real | 2 | "Week 32" é a identidade inteira de uma edição. A coluna diz PUBLISHED e mostra a hora de captura |
| 3 | Controlo e liberdade | 2 | Nenhum undo. Uma só edição aberta por vez. Sem arrastar |
| 4 | Consistência | 3 | O vocabulário radar é aplicado com disciplina. Editar existe na fila e não na proposta |
| 5 | Prevenção de erro | 2 | Confirmação no envio e na rejeição em massa. Mas um URL de tracking é guardado em silêncio, sem marca na linha |
| 6 | Reconhecer vs recordar | 2 | Tens de saber de cabeça que semana é que edição. Nenhuma edição tem nome |
| 7 | Flexibilidade e eficiência | 1 | Sem teclado, sem arrastar, sem segunda edição, sem reutilizar um artigo. É a queixa toda |
| 8 | Estética e minimalismo | 3 | Genuinamente bom. Perde o 4 na banda de estado a 390px |
| 9 | Recuperação de erro | 3 | LoadError com retry, razões de recusa escritas. Perde na falha silenciosa do unwrap |
| 10 | Ajuda e documentação | 1 | Nenhuma ajuda contextual em nenhum ecrã |
| **Total** | | **22/40** | **Aceitável, no limite inferior** |

Vinte e dois em quarenta com estética a 3 e flexibilidade a 1 é o retrato de um produto
bem desenhado por cima de um modelo que não dá liberdade.

---

## A. A edição é rígida por construção

### A1 [P1] Uma edição não tem identidade além do número da semana

`prisma/schema.prisma:289-348`. `week Int` e `year Int` obrigatórios,
`@@unique([week, year, organizationId])`. Não há `title`, não há `kind`, não há intervalo
de datas.

Uma edição especial é estruturalmente impossível: para a criares tens de queimar um número
de semana, que depois já não podes usar para a edição semanal dessa semana.

### A2 [P1] A UI admite exactamente uma edição aberta, e é isso que bloqueia a especial

`app/dashboard/send/page.tsx:389`:

```ts
const openEdition = editions.find((e) => e.status !== "SENT") ?? null;
```

A primeira não enviada, por ordem de ano e semana descendente, é "a" edição aberta. E o
botão de criar só existe quando não há nenhuma (linhas 445-453): com uma edição aberta,
o lugar dele é ocupado por "Open builder". Não existe caminho na interface para criar uma
segunda edição enquanto a da semana está de pé.

### A3 [P2] `scheduledDate` está no esquema e ninguém a lê nem a escreve

`prisma/schema.prisma:295`. É exactamente o campo que daria uma data à edição, e está
morto desde que foi criado.

### A4 [retirado] O default do diálogo de criação não é um defeito

Escrito primeiro como defeito e está errado. O estado inicial de `week` é `1`
(`app/dashboard/send/page.tsx:280`), mas um `useEffect` corrige-o para a semana ISO
corrente no momento do mount (linhas 316-318), e o diálogo só abre por clique, portanto
sempre depois disso. O que fica é a observação menor de que a criação de uma edição são
dois inputs numéricos e nada mais, que é o problema de A1 e não um default errado.

### A5 [P2] O assunto e a etiqueta do email são derivados da semana

`lib/email/edition-data.ts:207-210`:

```ts
editionLabel: `Week ${input.week}`,
subject: `AI Radar Weekly - Week ${input.week}, ${input.year}`,
```

Uma edição especial herdaria um assunto errado mesmo que o modelo passasse a permiti-la.

### A6 [P2] Um artigo vive numa edição e só numa

`app/api/editions/route.ts:193` filtra `editions: { none: {} }`, e a query de candidatos da
proposta exclui o que já está numa edição. Não há forma de reaproveitar uma peça numa
retrospectiva ou numa especial temática.

---

## B. Os estados do artigo não chegam para o que queres

### B1 [P1] Três estados, nenhum deles é rascunho

`prisma/schema.prisma:255-259`: `PENDING_REVIEW`, `APPROVED`, `REJECTED`. Não há draft,
não há ready, não há parked. Aprovar põe o artigo num pool global cuja única saída é a
edição corrente: a coluna do board diz literalmente "Approved / ready for an edition" e a
seguinte "In edition / Week 32".

### B2 [P1] O board de pipeline é decorativo

Não existe drag and drop em nenhum ficheiro do repositório. Grep por `draggable`,
`onDragStart`, `dnd-kit` e `react-beautiful`: zero ocorrências. Mover um artigo entre
colunas não é uma interacção que exista, e a ordem dentro da edição faz-se com ↑ e ↓, um
passo de cada vez (`components/proposal/proposal-view.tsx:360-416`).

### B3 [P1] Editar um artigo é editar duas coisas

`app/api/articles/[id]/route.ts:51-91` aceita `summary` e `category`. Mais nada. Título,
URL, autor e data não são editáveis em lado nenhum do produto.

### B4 [P0] E esse PATCH não tem escopo de organização nem verificação de role

Mesmo ficheiro, mesma função. Não chama `requireOrgContext`, não chama `requireRole`, e
escreve com o cliente `prisma` cru:

```ts
const article = await prisma.article.update({ where: { id }, data: updateData });
```

O `middleware.ts:92-94` exige sessão em `/api/`, portanto não está aberto à internet. Mas
qualquer utilizador autenticado de qualquer organização reescreve o resumo e as categorias
de qualquer artigo de qualquer tenant, e um `VIEWER` também. É o padrão que o RQ-005
identificou como conflito C2 e corrigiu nas rotas de edição, e que ficou aqui.

---

## C. As datas estão erradas, não apenas ausentes

### C1 [P0] Todo o artigo que entra por email tem data de publicação falsa

`lib/curation/curator.ts`, função `curateArticle`, o caminho por onde passam **todos** os
artigos vindos de newsletter:

```ts
publishedAt: new Date(),
```

A data de publicação é o instante da ingestão. Não é uma aproximação, é outra grandeza.

E é apresentada com o rótulo errado. A tabela da fila tem uma coluna com o cabeçalho
**PUBLISHED** a mostrar "2h ago", "3h ago", "6h ago" (verificado em
`audit-queue.png`), e o selo de fonte na proposta e no detalhe do artigo mostra o mesmo
valor. Um artigo da semana passada apanhado hoje diz "2h ago" debaixo de "PUBLISHED".

### C2 [P1] Não existe data de captura

`createdAt` existe na tabela e não é devolvido por nenhuma API nem mostrado em nenhum
ecrã. A pergunta "quando é que apanhámos isto" não tem resposta no produto.

### C3 [P1] O extractor nunca pede a data ao modelo

`lib/inbound/extract.ts:23-27`: `DigestItem` é `title`, `url`, `snippet`. O prompt não pede
data e o schema não tem onde a pôr. E o `receivedAt` do email, que é a única data
verdadeira que temos, não é propagado para nada.

### C4 [P1] O template default não tem data por artigo

`lib/email/edition-template.ts:38-46`: `EmailArticle` é `title`, `summary`, `url`,
`source?`, `coverage?`. A linha de meta renderizada (linha 168) é `source · N sources`.
Nenhuma data chega ao leitor. `SourceArticle` em `lib/email/edition-data.ts:14-20` também
não tem `publishedAt`, portanto o dado não existe já à entrada do renderer.

### C5 [P2] O nome do publisher é adivinhado do hostname

`lib/email/edition-data.ts:67-104`, com um mapa de 19 domínios conhecidos e um fallback que
capitaliza o nome registável. O comentário admite a causa: *"since the schema stores no
source name here"*.

### C6 [P2] O RSS também pode mentir na data

`lib/curation/rss-collector.ts:122`: `let publishedAt = new Date()`, sobreposto só se o item
trouxer `pubDate` ou `isoDate`. Um feed sem data produz um artigo datado de agora, com o
mesmo problema em menor escala.

---

## D. A proveniência das newsletters não existe

Esta é a parte onde tinhas razão de forma mais completa.

### D1 [P0] `Article` não tem relação com a fonte nem com o email

`prisma/schema.prisma:212-253`. Sem `sourceId`, sem `inboundEmailId`. O único vestígio da
origem é a string `sourceUrl`. Consequências directas:

- "que artigos é que esta newsletter produziu" não é respondível;
- "de onde veio este artigo" só é respondível olhando para o domínio do URL;
- e a pergunta é exactamente a mesma que o STATUS.md tem em aberto desde ontem.

### D2 [P1] Nenhum ecrã mostra os emails recebidos

Grep por `inboundEmail` fora de `lib/inbound/`: **uma** ocorrência, o webhook que os
escreve. Em produção há 44 emails reais lidos e processados, e nenhum deles é visível no
produto. A única vista sobre a tabela é a de remetentes desconhecidos, que é o
complemento: mostra só os que **não** deram match com uma fonte.

O ecrã de fontes (`audit-sources-vp.png`) mostra por newsletter o nome, a saúde, o modo de
parse, o endereço, a cadência e o último recebido. Não mostra quantos emails chegaram,
quantos artigos cada um produziu, nem oferece maneira de abrir um email e ver o que saiu
dele.

### D3 [P1] O nome da fonte é produzido e deitado fora

`lib/curation/rss-collector.ts:13` tem `sourceName` no `RSSArticle`, o collector preenche-o,
e o curator usa-o **só em linhas de log**. Nunca chega à linha do `Article`.

### D4 [P1] O link pode ser o wrapper da newsletter, em silêncio

Isto é literalmente o que não querias, e acontece.

`lib/curation/unwrap-url.ts` resolve a cadeia de redirects corretamente. Quando falha,
devolve `unwrapped: false` com o URL de entrada. E `lib/inbound/process.ts:373-385` só
descarta o item quando a nota contém `"not a public address"` ou `"not allowed"`:

```ts
if (!unwrapped.unwrapped && unwrapped.note?.startsWith("stopped: ")) {
  if (unwrapped.note.includes("not a public address") || unwrapped.note.includes("not allowed")) {
    return { created: 0, duplicate: false, note: `${email.id}: refused a link (...)` };
  }
}
```

Todas as outras falhas seguem em frente e criam o artigo com o URL de tracking:
`stopped after 5 hops`, `stopped: the redirects loop`, `stopped: the redirect target was
not a URL`, e qualquer erro de rede, incluindo o timeout de 5 segundos
(`config.emailIngest.redirectTimeoutMs`) contra um publisher lento. Sem nota, sem marca na
linha, sem forma de saber depois.

E o que o leitor vê nesse caso, verificado a correr a função `publicationName` real:

| URL guardado | Publisher renderizado |
|---|---|
| `link.mail.beehiiv.com/ss/c/...` | **Beehiiv** |
| `links.therundown.ai/e/c/...` | **Therundown** |
| `tracking.tldrnewsletter.com/CL0/...` | **Tldrnewsletter** |

### D5 [P1] No modo ESSAY o link é, por desenho, o da própria newsletter

`lib/inbound/process.ts:314`: `extracted.item.webVersionUrl ?? source.url`. Para uma essay
que é ela mesma o artigo isto defende-se. O problema é que nada no modelo distingue "este
link é a fonte original" de "este link é a newsletter", portanto as duas situações são
indistinguíveis a jusante.

### D6 [P1] O Link Take é praticamente inalcançável para um artigo de newsletter

Três factos que se compõem:

- `FETCH_ALLOWLIST` está **vazia** (`lib/rewrite/fetch-policy.ts:35`), portanto `mayFetch`
  recusa todos os URLs e a página nunca é buscada;
- logo o input do rewrite é sempre o `content` guardado, que num digest é o snippet de uma
  ou duas frases da newsletter (`lib/inbound/process.ts:394`);
- e o piso é 200 caracteres (`lib/rewrite/config.ts:19`).

Resultado: os snippets curtos dão "Nothing was generated", e os que passam produzem uma
peça escrita a partir de duas frases. A lista vazia é deliberada e está testada; o que não
foi considerado foi o que ela significa para os artigos que agora chegam por email.

---

## E. UI/UX, o que é defeito e não gosto

### E1 [P1] Layout quebrado a 390px na banda de estado da colecção

`components/proposal/machine-status.tsx:62-67`. A fila é `flex flex-wrap items-center` e o
bloco de texto tem `min-w-0 flex-1`. O chip e o botão não encolhem; o texto encolhe sem
limite, portanto o browser nunca precisa de quebrar a linha. A 390px o título fica numa
coluna de uns 60px, uma ou duas palavras por linha:

```
Collection
last ran
2h ago
and
succeeded   [no run needed] [Run collection]
```

Verificado em `audit-feed-mobile.png`. Correcção: `basis-full sm:basis-auto` no bloco de
texto, ou agrupar chip e botão num contentor `w-full sm:w-auto`.

### E2 [P2] Densidade de controlos por linha, sem acelerador nenhum

Quatro controlos por linha na proposta (↑, ↓, Remove, Reject) e três na fila (Edit,
Reject, Approve). Sem atalhos de teclado em nenhum sítio, e sem acção em lote na proposta,
embora a fila tenha. Para o utilizador que faz isto todas as semanas, é a diferença entre
um minuto e dez.

### E3 [P2] Só tempo relativo, e nunca a data

As edições têm marca absoluta ("Sent 30 Jul 2026, 04:32"). Os artigos não têm nenhuma: em
todos os ecrãs é "2h ago", "6h ago". Não há um único lugar no dashboard onde se veja a data
e hora de publicação de um artigo, o que torna a mentira de C1 invisível.

---

## Contagem

| Severidade | Quantos |
|---|---|
| P0 | 4: o PATCH sem tenant, a data de publicação falsa, a ausência de relação com a origem, e o não haver vista sobre os emails |
| P1 | 12 |
| P2 | 7 |
| Retirados | 1: A4, o default do diálogo de criação, que se auto-corrige no mount |

Vinte e três achados, dos quais quatro são defeitos de dados ou de segurança que já
estão a produzir efeito em produção, e o resto é a rigidez que descreveste, com a linha de
código que a causa.

---

## Perguntas que valem mais do que respostas

- Se uma edição tivesse **nome e data** em vez de número de semana, e a semana passasse a
  ser um rótulo derivado, o que é que restava do problema? A minha leitura é: quase nada.
- Aprovar um artigo devia significar "vai para a próxima edição" ou "está pronto, decide
  depois em qual"? São dois produtos diferentes e o modelo actual só permite o primeiro.
- Um artigo que aparece em duas newsletters no mesmo dia é hoje um duplicado descartado.
  Devia ser um artigo com **duas** proveniências, e isso ser o sinal de que a história é
  importante?
- Quando o unwrap falha, o certo é guardar o wrapper em silêncio, marcar o artigo como
  tendo origem não resolvida, ou recusar o item? Hoje é o primeiro, que é o pior dos três.
