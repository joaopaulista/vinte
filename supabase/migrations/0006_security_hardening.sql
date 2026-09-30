-- VINTE — endurecimento de segurança
--
-- 1. `pluggy_transaction_id` deixa de ser único no banco inteiro e passa a ser
--    único por usuário. Globalmente único, um usuário podia inserir (a RLS
--    permite) uma transação com o id de uma transação de outra pessoa e, como o
--    sync usa `ignoreDuplicates`, a transação legítima nunca seria gravada.
--
-- 2. As políticas de escrita passam a exigir que as referências apontem para
--    linhas do próprio usuário. Antes, bastava `user_id = auth.uid()`: dava para
--    pendurar uma transação na conta de outra pessoa ou usar a categoria
--    customizada de outro usuário (a FK não passa pela RLS).
--
-- 3. `seed_demo_data` deixa de ser chamável pela API. Toda função em `public` é
--    exposta como RPC para `anon` e `authenticated` por padrão; o seed é
--    ferramenta de administrador, para rodar no SQL Editor.

-- ---------------------------------------------------------------------------
-- 1. Unicidade da transação do Pluggy por usuário
-- ---------------------------------------------------------------------------
alter table public.transactions
  drop constraint if exists transactions_pluggy_transaction_id_key;

alter table public.transactions
  drop constraint if exists transactions_user_pluggy_transaction_key;

alter table public.transactions
  add constraint transactions_user_pluggy_transaction_key
  unique (user_id, pluggy_transaction_id);

-- ---------------------------------------------------------------------------
-- 2. Referências só para linhas do próprio usuário
-- ---------------------------------------------------------------------------

-- Categoria visível para o usuário: do sistema (user_id null) ou dele.
create or replace function public.is_own_or_system_category(target uuid)
returns boolean
language sql
stable
security invoker
as $$
  select target is null
      or exists (
        select 1 from public.categories c
         where c.id = target
           and (c.user_id is null or c.user_id = auth.uid())
      )
$$;

drop policy if exists "accounts_all" on public.accounts;
drop policy if exists "accounts_select" on public.accounts;
drop policy if exists "accounts_write" on public.accounts;
drop policy if exists "accounts_update" on public.accounts;
drop policy if exists "accounts_delete" on public.accounts;

create policy "accounts_select" on public.accounts
  for select using (auth.uid() = user_id);

create policy "accounts_write" on public.accounts
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.bank_connections bc
       where bc.id = bank_connection_id and bc.user_id = auth.uid()
    )
  );

create policy "accounts_update" on public.accounts
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.bank_connections bc
       where bc.id = bank_connection_id and bc.user_id = auth.uid()
    )
  );

create policy "accounts_delete" on public.accounts
  for delete using (auth.uid() = user_id);

drop policy if exists "transactions_all" on public.transactions;
drop policy if exists "transactions_select" on public.transactions;
drop policy if exists "transactions_insert" on public.transactions;
drop policy if exists "transactions_update" on public.transactions;
drop policy if exists "transactions_delete" on public.transactions;

create policy "transactions_select" on public.transactions
  for select using (auth.uid() = user_id);

create policy "transactions_insert" on public.transactions
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.accounts a
       where a.id = account_id and a.user_id = auth.uid()
    )
    and public.is_own_or_system_category(category_id)
    and public.is_own_or_system_category(subcategory_id)
  );

create policy "transactions_update" on public.transactions
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.accounts a
       where a.id = account_id and a.user_id = auth.uid()
    )
    and public.is_own_or_system_category(category_id)
    and public.is_own_or_system_category(subcategory_id)
  );

create policy "transactions_delete" on public.transactions
  for delete using (auth.uid() = user_id);

drop policy if exists "categories_insert" on public.categories;
create policy "categories_insert" on public.categories
  for insert with check (
    auth.uid() = user_id
    and public.is_own_or_system_category(parent_category_id)
  );

drop policy if exists "categories_update" on public.categories;
create policy "categories_update" on public.categories
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and public.is_own_or_system_category(parent_category_id)
  );

drop policy if exists "category_rules_insert" on public.category_rules;
create policy "category_rules_insert" on public.category_rules
  for insert with check (
    auth.uid() = user_id
    and public.is_own_or_system_category(category_id)
    and public.is_own_or_system_category(subcategory_id)
  );

drop policy if exists "category_rules_update" on public.category_rules;
create policy "category_rules_update" on public.category_rules
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and public.is_own_or_system_category(category_id)
    and public.is_own_or_system_category(subcategory_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Seed fora da API pública
-- ---------------------------------------------------------------------------
revoke execute on function public.seed_demo_data(uuid) from public, anon, authenticated;
