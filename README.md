# Controle financeiro

App de finanças da família baseado na planilha do Google Sheets: tabelas de **Entradas**, **Saídas** e tabelas auxiliares (Cartão de crédito, Assinaturas…), linhas **vinculadas** que somam outras tabelas, **budgets** por linha e **adicionar gasto** por texto, foto ou áudio com IA.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Drizzle ORM · Postgres (Neon) · Better Auth (email/senha) · Vercel AI SDK.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha DATABASE_URL e BETTER_AUTH_SECRET
cp .env.local .env           # o drizzle-kit e o script de seed leem .env
npm run db:migrate           # cria as tabelas
npm run dev
```

Abra http://localhost:3000, crie sua conta e a planilha (onboarding).

### Importar a planilha de 2026

Depois de criar a conta **e** a planilha no app:

```bash
npm run seed:planilha -- --email seu@email.com --replace
```

Importa Entradas, Saídas, Cartão de crédito, Assinaturas e Manutenções de 2026 (com os vínculos) e 5 budgets de exemplo. `--replace` apaga as tabelas atuais antes.

## Deploy (Neon + Vercel)

1. **Neon:** crie um projeto e copie a connection string **pooled** (host com `-pooler`, `?sslmode=require`).
2. Rode as migrations contra o Neon (uma vez, e a cada mudança de schema):
   ```bash
   DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require" npm run db:migrate
   ```
3. **Vercel:** importe o repositório e configure as variáveis:
   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | connection string pooled do Neon |
   | `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
   | `BETTER_AUTH_URL` | URL pública, ex. `https://financas.vercel.app` |
   | `ANTHROPIC_API_KEY` | opcional — texto e foto com IA |
   | `AI_MODEL` | opcional — padrão `claude-haiku-4-5` |
   | `OPENAI_API_KEY` | opcional — transcrição de áudio |
4. Para importar seus dados em produção, rode o `seed:planilha` localmente com o `DATABASE_URL` do Neon.

Sem `ANTHROPIC_API_KEY`, o "Adicionar rápido" por texto usa um interpretador por palavras-chave (mercado → Alimentação, posto → Gasolina…) e o modo Foto fica desativado. Sem `OPENAI_API_KEY`, o modo Áudio fica desativado.

## Como os dados funcionam

- **Dinheiro em centavos** (`integer`) e **mês como `date` no dia 1**.
- `fin_tables` (kind `in` | `out` | `sub`) → `lines` → `entries`.
- **Valor de uma célula** = `SUM(entries.amount_cents)` da linha naquele mês. Vários lançamentos podem cair na mesma célula (ex.: compras de mercado).
- **Repetição:** uma `series` (única, mensal, anual, parcelada) gera uma `entry` por mês, cada uma com ID próprio. Editar "só este mês" altera uma entry; "este e os próximos" divide a série em duas; "toda a série" altera a série e todas as entries. Séries sem data final são estendidas automaticamente quando você abre um ano novo.
- **Linhas vinculadas:** `lines.is_linked` + `line_sources` (tabela inteira ou linha específica, com sinal +/−). O cálculo é feito em `src/lib/grid.ts` (ordenação topológica); ciclos são bloqueados ao salvar.
- **Tabelas `sub`** não entram direto no balanço — elas chegam nas Saídas através de uma linha vinculada (ex.: Saídas › Cartão de crédito = total da tabela Cartão).
- **Budgets:** `budgets` + `budget_sources` (mesma ideia dos vínculos, pode somar várias origens) + `budget_limits` (só os meses diferentes do limite padrão).
- **Household:** você e sua esposa compartilham a mesma planilha. Em **Ajustes** há um link de convite.

## Estrutura

```
src/
  app/
    (app)/planilha     visão completa e simplificada, painel de célula
    (app)/budget       lista, heatmap, criar/editar budget
    (app)/tabelas      criar/editar tabelas, linhas e vínculos
    (app)/ajustes      nome, convite, status da IA, sair
    api/ai/suggest     texto/foto/áudio → sugestão de lançamento
    api/auth/[...all]  Better Auth
  components/          UI (sheet, quick-add, link-editor, cell-panel…)
  db/                  schema Drizzle + client
  lib/                 auth, sessão, formatação, cálculo da planilha
  server/              server actions, carregamento de dados, séries, IA
scripts/seed-planilha.ts
drizzle/               migrations SQL
```

## Scripts

| | |
|---|---|
| `npm run dev` | desenvolvimento |
| `npm run build` / `start` | produção |
| `npm run typecheck` | TypeScript |
| `npm run db:generate` | gera migration após mudar `src/db/schema.ts` |
| `npm run db:migrate` | aplica migrations |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed:planilha -- --email …` | importa a planilha 2026 |
