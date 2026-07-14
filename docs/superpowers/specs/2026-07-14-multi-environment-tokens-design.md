# Multi-environment tokens (sandbox + production simultâneos)

**Data:** 2026-07-14
**Versão alvo:** `1.1.1 → 1.2.0` (feature retrocompatível)

## Problema

Hoje o servidor MCP aceita **um** ambiente por vez: `BILLFORWARD_ACCESS_TOKEN` +
`BILLFORWARD_ENVIRONMENT` definem um único token e uma única `BASE_URL`, bakeados no
singleton `bfClient` (`src/billforward.ts`) no momento do import. Trocar de ambiente
exige reconfigurar a env e reiniciar.

Queremos que sandbox **e** produção possam estar configurados ao mesmo tempo, sem que
nenhum dos dois seja obrigatório, e sem reclamar quando o usuário só tem um. A LLM
escolhe o ambiente por chamada; se não souber, pergunta; se só houver um, usa ele em
silêncio; se houver dois e ela não especificar, recebe um erro instruindo a escolher.

## Requisitos

1. Suportar os dois tokens (sandbox e produção) configurados simultaneamente.
2. Nenhum dos dois é obrigatório. Ter só um — ou nenhum — não gera aviso nem crash.
3. Cada tool que chama a API expõe um parâmetro **opcional** `environment` para a LLM
   indicar o alvo.
4. Regra de resolução por chamada:
   - `environment` informado e configurado → usa esse.
   - `environment` informado mas não configurado → erro descritivo.
   - sem `environment`, só um configurado → usa o único (silencioso).
   - sem `environment`, os dois configurados → **erro**: tem que escolher.
   - sem `environment`, nenhum configurado → erro: nenhum token.
5. Retrocompatibilidade total: configs existentes (`BILLFORWARD_ACCESS_TOKEN` +
   `BILLFORWARD_ENVIRONMENT`) continuam funcionando sem mudança.

## Não-objetivos

- **Read-only por ambiente.** `BILLFORWARD_READ_ONLY` continua global (uma flag só).
  Se no futuro quisermos sandbox liberado e produção travado, vira outro spec.
- Trocar o mecanismo de autenticação (segue via `access_token` na query).

## Arquitetura

O singleton `bfClient` dá lugar a um resolver `getClient(environment?)` que centraliza
descoberta de token, resolução de ambiente e cache de clients. A regra de erro é lançada
por ele e sobe pelo `try/catch` que **todo tool já tem**, virando `isError` com
`error.message` — a mensagem instrutiva chega na LLM sem tocar nos handlers além da troca
`bfClient` → `client`.

### 1. Config e descoberta de token (`src/config.ts`)

Substituir o bloco de ambiente único por resolução por ambiente:

- `SANDBOX_TOKEN` ← `BILLFORWARD_SANDBOX_ACCESS_TOKEN`, com fallback pro legado
  `BILLFORWARD_ACCESS_TOKEN` **apenas se** `BILLFORWARD_ENVIRONMENT` for `sandbox` ou
  ausente (sandbox é o default de hoje).
- `PRODUCTION_TOKEN` ← `BILLFORWARD_PRODUCTION_ACCESS_TOKEN`, com fallback pro legado
  `BILLFORWARD_ACCESS_TOKEN` **apenas se** `BILLFORWARD_ENVIRONMENT` for `production`.
- `baseUrl` por ambiente continua respeitando os overrides existentes
  `BILLFORWARD_SANDBOX_URL` / `BILLFORWARD_PRODUCTION_URL` (com os mesmos defaults).
- Exportar um mapa dos ambientes **configurados** → `{ token, baseUrl }`. Ambiente sem
  token não entra no mapa.
- Sem erro nem warning se houver só um ou nenhum.

`BILLFORWARD_ENVIRONMENT` deixa de ser roteamento e passa a ser **só peça do fallback
legado**: a pista de qual balde o token legado ocupa. Usuário novo usa os nomes por
ambiente e ignora essa var.

### 2. Resolver `getClient(environment?)` (`src/billforward.ts`)

```
getClient(environment?: 'sandbox' | 'production') → AxiosInstance
```

Resolução:

| `environment` | Configurados | Resultado |
|---|---|---|
| `sandbox`/`production` | esse existe | usa esse |
| pedido | esse **não** existe | erro: ambiente não configurado (lista disponíveis) |
| ausente | só um | usa o único |
| ausente | os dois | erro: especifique `environment` |
| ausente | nenhum | erro: nenhum token configurado |

- Clients axios ficam num `Map<env, AxiosInstance>`, criados sob demanda na 1ª chamada,
  cada um com seu `baseURL` e `access_token`. O interceptor de resposta (rate limit,
  formatação de erro) que hoje está no `bfClient` é aplicado a cada instância criada.
- Erros são `Error` comuns; sobem pelo `try/catch` existente de cada tool.

Mensagens (escritas pra LLM ler e agir):

- Ambíguo: *"Two environments are configured (sandbox, production). Re-call this tool with
  the `environment` parameter set to one of them."*
- Pedido não configurado: *"The 'production' environment is not configured on this server.
  Available: sandbox."*
- Nenhum token: *"No Billforward token is configured. Ask the user to set
  BILLFORWARD_SANDBOX_ACCESS_TOKEN and/or BILLFORWARD_PRODUCTION_ACCESS_TOKEN."*

### 3. Parâmetro `environment` nos tools

Campo zod compartilhado, definido uma vez e espalhado em cada `inputSchema`:

```ts
export const environmentParam = {
  environment: z.enum(['sandbox', 'production']).optional()
    .describe("Which Billforward environment to target. Required when both sandbox and " +
      "production are configured; if only one is configured it's used automatically. " +
      "Ask the user if you're unsure which to use.")
};
```

Cada tool muda em duas linhas:

```ts
inputSchema: { ...environmentParam, /* campos existentes */ }
// ...
async ({ environment, /* resto */ }) => {
  const client = getClient(environment);   // 1ª linha do try
  // troca bfClient → client no corpo do handler
```

- **Opcional no schema** de propósito. Obrigatório forçaria a LLM a mandar sempre,
  quebrando o caso "só um configurado". A obrigatoriedade real é em runtime, via
  `getClient`. A `description` empurra a LLM a preencher quando importa.
- **`help`** não faz chamada de API → não ganha o parâmetro. Passa a listar quais
  ambientes estão configurados, pra LLM conhecer o terreno.
- **`get-me`** ganha o parâmetro como qualquer outro (valida credencial de um ambiente).
- Tools multi-chamada (`search`, `get-customer-summary`, `get-metadata-schema`) resolvem
  `const client = getClient(environment)` **uma vez** no topo e reusam.

Tools afetados (todos os que hoje importam `bfClient`):
`list-accounts`, `get-account-by-email`, `get-account`, `list-profiles`,
`create-account`, `update-account`, subscriptions, invoices, payments, charges, plans,
`search`, `get-customer-summary`, `get-metadata-schema`, `get-me`.

## Edge cases

- **Zero ambientes configurados:** servidor sobe normalmente (sem crash no boot). O erro
  aparece só quando a LLM chama um tool. `help` continua funcionando e orienta a config.
- **Legado com `BILLFORWARD_ENVIRONMENT` ausente:** token legado vira sandbox (idêntico ao
  comportamento atual).

## Teste

Um arquivo `src/billforward.test.ts` (Vitest, padrão do repo) cobrindo a resolução do
`getClient`, onde mora o risco:

- só sandbox → sem param usa sandbox; pedir `production` → lança.
- só production via legado (`BILLFORWARD_ACCESS_TOKEN` + `BILLFORWARD_ENVIRONMENT=production`)
  → mapeia pro balde de produção.
- os dois configurados → sem param **lança**; com param usa o ambiente certo.
- zero → lança com a mensagem de "nenhum token".

Manipular `process.env` antes de importar o módulo.

## Docs

- Atualizar a tabela de env vars do README: adicionar `BILLFORWARD_SANDBOX_ACCESS_TOKEN` e
  `BILLFORWARD_PRODUCTION_ACCESS_TOKEN`; marcar `BILLFORWARD_ACCESS_TOKEN` /
  `BILLFORWARD_ENVIRONMENT` como legado (ainda suportado).
- Atualizar o exemplo de config do `mcpServers` mostrando os dois tokens.
- `package.json`: bump `1.1.1 → 1.2.0`.
