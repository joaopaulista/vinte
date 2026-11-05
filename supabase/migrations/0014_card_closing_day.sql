-- VINTE — fechamento e vencimento do cartão, e data de competência
--
-- No cartão de crédito, o gasto vale para o ciclo da fatura, não para o dia
-- da compra. Com fechamento no dia 25:
--   compra em 20/10 → entra na fatura que fecha em 25/10 → conta em outubro;
--   compra em 28/10 → já é da fatura que fecha em 25/11 → conta em novembro.
--
-- 1. `accounts.closing_day` / `accounts.due_day`: dia do fechamento e do
--    vencimento da fatura (1–31; em mês mais curto vale o último dia).
-- 2. `transactions.accounting_date` (data de competência): é a data que os
--    painéis e relatórios usam para dizer a que mês o lançamento pertence.
--    Igual à data da transação, exceto compra no cartão depois do fechamento,
--    que vai para o dia 1 do mês seguinte. Mantida por gatilho: na inserção,
--    ao mudar a data ou a conta, e ao mudar o fechamento do cartão.

-- ---------------------------------------------------------------------------
-- 1. Fechamento e vencimento
-- ---------------------------------------------------------------------------
alter table public.accounts
  add column if not exists closing_day smallint check (closing_day between 1 and 31),
  add column if not exists due_day smallint check (due_day between 1 and 31);

-- ---------------------------------------------------------------------------
-- 2. Data de competência
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists accounting_date date;

create or replace function public.compute_accounting_date(
  tx_date date,
  account_type text,
  closing smallint
)
returns date
language sql
immutable
as $$
  select case
    when closing is null
      or upper(coalesce(account_type, '')) not in ('CREDIT_CARD', 'CREDIT')
      -- Em mês mais curto que o dia do fechamento, fecha no último dia.
      or extract(day from tx_date) <= least(
           closing,
           extract(day from (date_trunc('month', tx_date) + interval '1 month - 1 day'))::int
         )
      then tx_date
    else (date_trunc('month', tx_date) + interval '1 month')::date
  end
$$;

create or replace function public.set_accounting_date()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  acc record;
begin
  select a.type, a.closing_day into acc from public.accounts a where a.id = new.account_id;
  new.accounting_date := public.compute_accounting_date(new.transaction_date, acc.type, acc.closing_day);
  return new;
end;
$$;

drop trigger if exists transactions_set_accounting_date on public.transactions;
create trigger transactions_set_accounting_date
  before insert or update of transaction_date, account_id on public.transactions
  for each row execute function public.set_accounting_date();

-- Mudou o fechamento (ou o tipo) do cartão: recalcula os lançamentos dele.
create or replace function public.recompute_accounting_dates()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.transactions t
     set accounting_date = public.compute_accounting_date(t.transaction_date, new.type, new.closing_day)
   where t.account_id = new.id;
  return null;
end;
$$;

drop trigger if exists accounts_recompute_accounting_dates on public.accounts;
create trigger accounts_recompute_accounting_dates
  after update of closing_day, type on public.accounts
  for each row
  when (old.closing_day is distinct from new.closing_day or old.type is distinct from new.type)
  execute function public.recompute_accounting_dates();

-- Preenche o que já existe (nenhum cartão tem fechamento ainda: fica igual à data).
update public.transactions t
   set accounting_date = public.compute_accounting_date(t.transaction_date, a.type, a.closing_day)
  from public.accounts a
 where a.id = t.account_id
   and t.accounting_date is null;

alter table public.transactions
  alter column accounting_date set not null;

create index if not exists transactions_accounting_date_idx
  on public.transactions(user_id, accounting_date desc);

-- Faz a API (PostgREST) enxergar as colunas novas.
notify pgrst, 'reload schema';
