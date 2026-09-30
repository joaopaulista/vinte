-- VINTE — schema inicial
-- Tabelas: categories, bank_connections, accounts, transactions
-- Todas com Row Level Security por user_id.

-- ---------------------------------------------------------------------------
-- categories
-- user_id NULL  = categoria padrao do sistema (visivel para todos, so leitura)
-- user_id SET   = categoria customizada, so do dono
-- parent_category_id = auto-referencia para subcategorias
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete cascade,
  parent_category_id uuid references public.categories(id) on delete cascade,
  name               text not null,
  icon               text,
  color              text,
  created_at         timestamptz not null default now()
);

create index if not exists categories_user_id_idx on public.categories(user_id);
create index if not exists categories_parent_idx  on public.categories(parent_category_id);

-- ---------------------------------------------------------------------------
-- bank_connections — vinculo com o "item" criado no Pluggy
-- ---------------------------------------------------------------------------
create table if not exists public.bank_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  pluggy_item_id   text not null,
  institution_name text,
  status           text not null default 'active',
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, pluggy_item_id)
);

create index if not exists bank_connections_user_id_idx on public.bank_connections(user_id);

-- ---------------------------------------------------------------------------
-- accounts — contas trazidas de cada conexao
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  bank_connection_id uuid not null references public.bank_connections(id) on delete cascade,
  pluggy_account_id  text,
  name               text,
  type               text,
  balance            numeric(14, 2) default 0,
  currency           text not null default 'BRL',
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (user_id, pluggy_account_id)
);

create index if not exists accounts_user_id_idx    on public.accounts(user_id);
create index if not exists accounts_connection_idx on public.accounts(bank_connection_id);

-- ---------------------------------------------------------------------------
-- transactions — tabela central
-- amount negativo = saida (despesa) / positivo = entrada (receita)
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  account_id             uuid not null references public.accounts(id) on delete cascade,
  pluggy_transaction_id  text unique,
  description            text,
  amount                 numeric(14, 2) not null,
  transaction_date       date not null,
  type                   text,
  category_id            uuid references public.categories(id) on delete set null,
  subcategory_id         uuid references public.categories(id) on delete set null,
  reconciliation_status  text not null default 'pending'
                           check (reconciliation_status in ('pending', 'approved', 'rejected')),
  reconciled_at          timestamptz,
  notes                  text,
  created_at             timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_status_idx  on public.transactions(user_id, reconciliation_status);
create index if not exists transactions_date_idx    on public.transactions(user_id, transaction_date desc);
create index if not exists transactions_account_idx on public.transactions(account_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.categories       enable row level security;
alter table public.bank_connections enable row level security;
alter table public.accounts         enable row level security;
alter table public.transactions     enable row level security;

-- categories: le as proprias + as padrao do sistema; escreve so as proprias
drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories
  for select using (user_id is null or auth.uid() = user_id);

drop policy if exists "categories_insert" on public.categories;
create policy "categories_insert" on public.categories
  for insert with check (auth.uid() = user_id);

drop policy if exists "categories_update" on public.categories;
create policy "categories_update" on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "categories_delete" on public.categories;
create policy "categories_delete" on public.categories
  for delete using (auth.uid() = user_id);

-- bank_connections / accounts / transactions: acesso total apenas ao dono
drop policy if exists "bank_connections_all" on public.bank_connections;
create policy "bank_connections_all" on public.bank_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "accounts_all" on public.accounts;
create policy "accounts_all" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transactions_all" on public.transactions;
create policy "transactions_all" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
