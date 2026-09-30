# VINTE

Painel financeiro pessoal: centraliza contas bancárias via Open Finance, passa cada
transação por uma **conciliação** (aprovar/reprovar + categoria e subcategoria) e só
depois joga os números no **dashboard**.

## Stack

| Camada | Escolha |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilo | Tailwind CSS v4 |
| Gráficos | Recharts |
| Banco + Auth | Supabase (Postgres + Auth + Row Level Security) |
| Backend server-side | Supabase Edge Functions (Deno) |
| Open Finance | Pluggy (Sandbox) |
| Hospedagem | Netlify |

## Rodando localmente

### 1. Criar o projeto no Supabase

Crie um projeto em [supabase.com](https://supabase.com) e rode, no **SQL Editor**, os
arquivos de `supabase/migrations/` **na ordem**:

1. `0001_initial_schema.sql` — tabelas + índices + Row Level Security
2. `0002_default_categories.sql` — 13 categorias e 48 subcategorias padrão
3. `0003_demo_data.sql` — cria a função `seed_demo_data()` (opcional, mas recomendado no início)
4. `0004_category_rules.sql` — motor de categorização automática
5. `0005_default_category_rules.sql` — 136 regras padrão de categorização
6. `0006_security_hardening.sql` — endurece a RLS e tira o seed da API pública (**obrigatória**)
7. `0007_category_delete_lock.sql` — impede apagar categoria em uso e move as transações antes de apagar

### 2. Configurar as variáveis

```bash
cp .env.example .env
```

Preencha com os valores de **Project Settings → API**:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

> A `anon key` é pública por design — quem protege os dados é a RLS, não o segredo da chave.

### 3. Subir o app

```bash
npm install
npm run dev
```

Acesse http://localhost:5173, crie sua conta em **/cadastro** e faça login.

### 4. Popular dados de demonstração (opcional)

Enquanto o Pluggy não está conectado, dá para exercitar o fluxo inteiro. No SQL Editor:

```sql
select public.seed_demo_data((select id from auth.users where email = 'voce@exemplo.com'));
```

Isso cria uma conta fictícia e ~97 transações cobrindo 5 meses. As dos **últimos 20 dias**
entram pendentes e sem categoria (para você exercitar a Conciliação, ~13 itens); as mais
antigas entram **aprovadas e categorizadas** (para o dashboard ter o que mostrar). Rodar de
novo substitui o seed anterior em vez de duplicar.

> As três migrations foram validadas contra um Postgres 16 limpo, incluindo um teste de
> isolamento com dois usuários: cada um enxerga só as próprias linhas, não consegue alterar
> transação alheia nem apagar categoria padrão do sistema.

## Como o app funciona

1. **Cadastro/Login** — Supabase Auth (e-mail + senha).
2. **Contas** — bancos conectados e saldos, com o botão que abre o Pluggy Connect e um
   **Sincronizar agora** para puxar o extrato sob demanda.
3. **Conciliação** — fila de transações `pending`. Você escolhe categoria (obrigatória para
   aprovar) e subcategoria (opcional), pode deixar uma observação, e **Aprova** ou **Reprova**.
4. **Transações** — listagem completa com filtros de busca, status, categoria e período.
   Dá para **reabrir** uma transação já conciliada e devolvê-la para a fila.
5. **Dashboard** — KPIs do mês com variação vs. mês anterior, alerta de gastos fora do padrão,
   entradas × saídas, tendência do saldo, despesas por categoria e as 5 maiores despesas.
   **Considera apenas transações aprovadas.**

## Categorização automática

Regras de texto sobre a descrição — não ML. São legíveis, depuráveis e acertam a maior parte
dos casos; modelo estatístico só faz sentido quando houver volume de correções para treinar.

Como funciona:

- Um **trigger** roda a cada inserção, então cobre a sincronização do Pluggy, o webhook e o
  seed de demonstração de uma vez só, sem cada caminho precisar lembrar de chamar.
- A sugestão preenche a categoria mas **não aprova nada**: a transação continua `pending` e
  passa pela Conciliação, marcada com "categoria sugerida". A automação economiza digitação,
  não substitui a conferência.
- Regra do usuário sempre vence a do sistema. No empate, ganha a de menor `priority` e depois
  a de padrão mais longo — é o que faz `uber eats` cair em Delivery e `uber` em Transporte.
- Ao aprovar com uma categoria, o app **cria uma regra a partir daquela descrição**. Ele extrai
  um "apelido de estabelecimento" descartando números e termos de operação: `COMPRA CARTAO 1234
  PADARIA DO ZE 12/03` vira o padrão `padaria`. É o "tratar a correção como dado de treinamento"
  — só que com regra que dá para ler e apagar.
- O botão **Sugerir categorias** reaplica as regras nas pendentes que ficaram sem classificação.

As 136 regras padrão cobrem os estabelecimentos e termos mais comuns de extratos brasileiros.

## Detecção de anomalias

O card "Fora do padrão neste mês" compara cada categoria com a média dos 3 meses anteriores e
destaca as que subiram **mais de 40% e mais de R$ 100** — os dois critérios juntos, porque 60%
a mais numa categoria de R$ 20 não é notícia.

A comparação é feita **no mesmo intervalo de dias**: no dia 8, o mês corrente é comparado com
os dias 1 a 8 dos meses anteriores. Comparar um mês pela metade com meses inteiros esconderia
qualquer anomalia até o fim do mês.

## Segurança

- **Row Level Security** em `categories`, `bank_connections`, `accounts` e `transactions`:
  cada usuário só enxerga as próprias linhas, mesmo consultando a API do Supabase por fora
  do app. Categorias padrão do sistema (`user_id is null`) são legíveis por todos e
  editáveis por ninguém.
- As **chaves do Pluggy** ficam só nos secrets das Edge Functions, nunca no bundle do frontend.
- A **senha do banco do usuário** nunca passa pelo sistema — fica dentro do widget do Pluggy.
- O webhook do Pluggy exige um segredo compartilhado (`x-webhook-secret`) porque roda sem JWT.
- Toda sincronização confere no Pluggy que o item pertence a quem está pedindo
  (`clientUserId`) — as credenciais do Pluggy enxergam os itens de todos os usuários.
- Erros internos nunca voltam para o navegador; ficam só no log da função.
- Em produção, restrinja o CORS: `npx supabase secrets set ALLOWED_ORIGINS=https://seu-dominio`.

Detalhes, checklist de deploy e como reportar vulnerabilidades: [SECURITY.md](SECURITY.md).
O workflow `security` roda o gitleaks sobre todo o histórico a cada push.

## Estrutura

```
src/
├── components/
│   ├── auth/            → casca das telas de login/cadastro
│   ├── categories/      → seletor de categoria + subcategoria
│   ├── common/          → layout, rota protegida, badges, estados vazios
│   ├── dashboard/       → KPIs, gráficos e tokens de cor
│   ├── reconciliation/  → card de aprovar/reprovar
│   └── transactions/    → filtros e tabela
├── contexts/            → AuthContext, PendingCountContext
├── hooks/               → useCategories, useTransactions
├── pages/               → Dashboard, Reconciliation, Transactions, Accounts, Login, Signup
├── services/            → supabaseClient + acesso a cada tabela
├── types/               → tipos de domínio
└── utils/               → formatação (BRL, datas) e agregações do dashboard

supabase/
├── migrations/          → SQL versionado
└── functions/
    ├── _shared/pluggy.ts   → cliente da API do Pluggy
    ├── sync-transactions/  → sincronização sob demanda (usa o JWT do usuário)
    └── pluggy-webhook/     → eventos em tempo real (usa service role + segredo)
```

## Identidade visual

### Paleta

| | Hex | Uso |
|---|---|---|
| Azul Petróleo | `#1E3A5F` | Texto e ações no tema claro; superfície dos cards no escuro |
| Off White | `#F8F6F2` | Fundo da página no claro; texto no escuro |
| Dourado Suave | `#D4A857` | Detalhes de marca; cor de ação no tema escuro |
| Verde Sucesso | `#2E8B57` | Confirmações e valores positivos |

Os quatro hexes são os tons de assinatura — ótimos para fundos e elementos grandes.
Para **texto pequeno** e para **séries de gráfico** eles ganham degraus próprios (mais
escuros no tema claro, mais claros no escuro), senão o contraste cai abaixo do legível.
Daí os pares `--vinte-*-ink` em [src/index.css](src/index.css).

### Temas

O tema vive num atributo `data-theme` no `<html>`, e todos os utilitários do Tailwind
apontam para variáveis CSS (`@theme inline`) em vez de hexes fixos — trocar de tema
repinta tudo, inclusive os gráficos, sem re-renderizar React.

Três opções em **Configurações → Tema**: Claro, Escuro e Sistema (acompanha o Windows
em tempo real). A escolha fica no `localStorage` e é aplicada por um script no
[index.html](index.html) **antes da primeira pintura** — sem isso, quem usa tema escuro
veria um flash branco a cada carregamento. Há também um atalho de um clique no menu.

O tema escuro tem degraus **escolhidos**, não é uma inversão automática do claro.

### Cores dos gráficos

As séries "Entradas" e "Saídas" usam **azul e dourado**. Não o verde/vermelho habitual de
finanças, e nem o verde/dourado da marca: os dois pares colapsam em protanopia.

| Par | ΔE protanopia | Veredito |
|---|---|---|
| Verde `#2E8B57` ↔ Dourado `#B0842E` | 5,4 | ✗ abaixo do piso de 8 |
| Azul `#1F63A8` ↔ Dourado `#B0842E` | 24,5 | ✓ tema claro |
| Azul `#5195D0` ↔ Dourado `#B98C3D` | 20,6 | ✓ tema escuro |

Cada tema foi validado contra o fundo em que os gráficos realmente aparecem (`#F8F6F2` no
claro, `#1E3A5F` no escuro), nas cinco checagens: faixa de luminosidade, saturação mínima,
separação sob daltonismo, separação com visão normal e contraste contra o fundo.

Legenda e rótulos diretos garantem que a identidade nunca dependa só da cor — o mesmo vale
para os selos de status, que sempre trazem a palavra escrita ("Aprovada", "Reprovada").

### Logo

Redesenhado em SVG em [src/components/common/Logo.tsx](src/components/common/Logo.tsx), a
partir da arte original. Vetor em vez do JPEG por três motivos: escala sem serrilhar, fundo
transparente (o arquivo original vem com o fundo chapado embutido) e as cores acompanham o
tema — o traço esquerdo do "V" clareia no escuro, como na arte de referência.

O nome usa uma serifada de sistema (Georgia). Se quiser fidelidade total à arte, dá para
trocar por uma fonte como Playfair Display — é mudar `--font-serif` no `index.css`.

## Conectando o Pluggy

As três Edge Functions precisam estar publicadas para o botão "Conectar banco" funcionar.

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <project-ref>
```

Guarde as credenciais do Pluggy como secrets — elas nunca entram no `.env` nem no bundle:

```bash
npx supabase secrets set PLUGGY_CLIENT_ID=xxx PLUGGY_CLIENT_SECRET=yyy
```

```bash
npx supabase functions deploy pluggy-connect-token sync-transactions
```

### Webhook (opcional, para sincronizar em tempo real)

```bash
npx supabase secrets set PLUGGY_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

```bash
npx supabase functions deploy pluggy-webhook --no-verify-jwt
```

No painel do Pluggy, cadastre a URL:
`https://<project-ref>.functions.supabase.co/pluggy-webhook?secret=<o-mesmo-segredo>`

O segredo vai na query string porque o cadastro de webhook do Pluggy aceita só a URL, sem
headers customizados. A função também aceita o header `x-webhook-secret`, que é preferível
quando houver como enviá-lo.

### Como o fluxo funciona

1. O frontend pede um **connect token** à `pluggy-connect-token` (a função autentica no
   Pluggy com client id/secret e devolve um token de curta duração).
2. O widget abre com esse token; o usuário escolhe o banco e digita as credenciais **dentro
   do widget** — elas nunca passam pelo VINTE.
3. No `onSuccess`, o frontend manda o `itemId` para a `sync-transactions`, que registra a
   `bank_connection`, busca contas e extrato, e grava tudo como `pending`.
4. As transações aparecem na Conciliação.

Detalhes de implementação que importam:

- O extrato usa `GET /v2/transactions` com paginação por **cursor**; o endpoint paginado por
  número de página está deprecado no SDK do Pluggy e será removido.
- Só transações **`POSTED`** são sincronizadas. Uma `PENDING` ainda pode mudar de valor ou
  sumir, e como o upsert usa `ignoreDuplicates` para não sobrescrever conciliações, ela
  ficaria congelada com o valor errado.
- O Pluggy manda `amount` sempre positivo com `type: DEBIT | CREDIT`; o banco guarda com sinal.

## Deploy no Netlify

`netlify.toml` já está configurado (build `npm run build`, publish `dist`, e o redirect
SPA sem o qual um F5 em `/conciliacao` daria 404).

No painel da Netlify, defina as variáveis de ambiente `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY`.

## Próximos passos

- [ ] **Rodar o Pluggy contra o Sandbox** — as funções passam no `deno check`, mas ainda
      **não foram executadas contra a API real**. É a primeira coisa a validar.
- [ ] **Sincronização periódica** — agendar `sync-transactions` (pg_cron ou Netlify scheduled function).
- [ ] **Reconexão de item** — quando o banco expira o consentimento, reabrir o widget com
      `itemIdToUpdate` em vez de criar uma conexão nova.
- [ ] **Gestão de categorias** — tela para criar/editar categorias customizadas
      (o backend e a RLS já suportam; falta a UI).
- [ ] **Regras de auto-categorização** — sugerir categoria pela descrição para acelerar a conciliação.
- [ ] **Stripe** — quando for monetizar.
