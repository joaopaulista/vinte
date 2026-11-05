-- VINTE — lançamentos manuais
--
-- Lançamento manual (`manual_entry`): transação digitada pelo usuário.
-- Só pode existir em conta manual (migration 0011) — nas contas do Open
-- Finance quem manda é o banco, e um lançamento digitado ali duplicaria o que
-- o sync traz. O saldo da conta manual já se recalcula sozinho a cada
-- lançamento (gatilhos da 0011).

alter table public.transactions
  add column if not exists manual_entry boolean not null default false;

create or replace function public.check_manual_entry()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.manual_entry and not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.is_manual
  ) then
    raise exception 'Lançamento manual só pode ser feito em conta manual'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_check_manual_entry on public.transactions;
create trigger transactions_check_manual_entry
  before insert or update of manual_entry, account_id on public.transactions
  for each row execute function public.check_manual_entry();
