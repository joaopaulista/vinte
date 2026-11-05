-- VINTE — responsáveis pelas contas
--
-- Quando duas pessoas usam o mesmo VINTE (um casal, por exemplo), cada conta
-- tem um responsável interno: "o Nubank é da Ana, o Itaú é do João". Os
-- responsáveis são cadastrados pelo dono do login e cada conta (conectada ou
-- manual) aponta para um deles. A Home e os Relatórios filtram por eles.

create table if not exists public.account_owners (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  color      text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists account_owners_user_id_idx on public.account_owners(user_id);

alter table public.account_owners enable row level security;

drop policy if exists "account_owners_all" on public.account_owners;
create policy "account_owners_all" on public.account_owners
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.accounts
  add column if not exists owner_id uuid references public.account_owners(id) on delete set null;

create index if not exists accounts_owner_idx on public.accounts(owner_id);

-- Responsável só do próprio usuário (a FK não passa pela RLS).
create or replace function public.is_own_account_owner(target uuid)
returns boolean
language sql
stable
security invoker
as $$
  select target is null
      or exists (
        select 1 from public.account_owners o
         where o.id = target and o.user_id = auth.uid()
      )
$$;

drop policy if exists "accounts_write" on public.accounts;
create policy "accounts_write" on public.accounts
  for insert with check (
    auth.uid() = user_id
    and public.is_own_account_owner(owner_id)
    and (
      (is_manual and bank_connection_id is null)
      or exists (
        select 1 from public.bank_connections bc
         where bc.id = bank_connection_id and bc.user_id = auth.uid()
      )
    )
  );

drop policy if exists "accounts_update" on public.accounts;
create policy "accounts_update" on public.accounts
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and public.is_own_account_owner(owner_id)
    and (
      (is_manual and bank_connection_id is null)
      or exists (
        select 1 from public.bank_connections bc
         where bc.id = bank_connection_id and bc.user_id = auth.uid()
      )
    )
  );
