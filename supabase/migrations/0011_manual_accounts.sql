-- VINTE — contas manuais
--
-- 1. Conta manual: uma conta que não vem do Open Finance (dinheiro na
--    carteira, cofrinho, conta de um banco sem conector). Não tem
--    `bank_connection_id` e é marcada com `is_manual`.
--
-- 2. O saldo da conta manual é calculado pelo banco:
--        balance = initial_balance + soma dos lançamentos não reprovados
--    Quem altera o saldo na mão altera `initial_balance` (o app calcula o
--    valor para o saldo atual bater com o informado).
--
-- Os lançamentos manuais nessas contas vêm na migration 0013.

-- ---------------------------------------------------------------------------
-- 1. Contas manuais
-- ---------------------------------------------------------------------------
alter table public.accounts
  alter column bank_connection_id drop not null;

alter table public.accounts
  add column if not exists is_manual boolean not null default false,
  add column if not exists initial_balance numeric(14, 2) not null default 0;

alter table public.accounts
  drop constraint if exists accounts_manual_xor_connection;

alter table public.accounts
  add constraint accounts_manual_xor_connection check (
    (is_manual and bank_connection_id is null)
    or (not is_manual and bank_connection_id is not null)
  );

-- As políticas de escrita da 0006 exigiam uma conexão do próprio usuário.
-- Conta manual não tem conexão; conta conectada continua exigindo a dele.
drop policy if exists "accounts_write" on public.accounts;
create policy "accounts_write" on public.accounts
  for insert with check (
    auth.uid() = user_id
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
    and (
      (is_manual and bank_connection_id is null)
      or exists (
        select 1 from public.bank_connections bc
         where bc.id = bank_connection_id and bc.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Saldo calculado das contas manuais
-- ---------------------------------------------------------------------------
create or replace function public.compute_manual_balance()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_manual then
    new.balance := new.initial_balance + coalesce((
      select sum(t.amount)
        from public.transactions t
       where t.account_id = new.id
         and t.reconciliation_status <> 'rejected'
    ), 0);
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_compute_manual_balance on public.accounts;
create trigger accounts_compute_manual_balance
  before insert or update on public.accounts
  for each row execute function public.compute_manual_balance();

-- Qualquer mudança nos lançamentos de uma conta manual "toca" a conta, e o
-- gatilho acima recalcula o saldo.
create or replace function public.touch_manual_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.accounts set updated_at = now()
     where id = old.account_id and is_manual;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.account_id <> old.account_id
      or new.amount <> old.amount or new.reconciliation_status <> old.reconciliation_status) then
    update public.accounts set updated_at = now()
     where id = new.account_id and is_manual;
  end if;
  return null;
end;
$$;

drop trigger if exists transactions_touch_manual_account on public.transactions;
create trigger transactions_touch_manual_account
  after insert or update or delete on public.transactions
  for each row execute function public.touch_manual_account();

