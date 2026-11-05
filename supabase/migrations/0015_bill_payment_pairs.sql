-- VINTE — pagamento de fatura reconhecido pelo par
--
-- A 0009 reconhece o pagamento de fatura pela descrição, mas cada banco
-- escreve de um jeito ("PAGTO CARTAO ITAU", "BOLETO NU PAGAMENTOS"…) e o que
-- escapa cai na fila da Conciliação — sem motivo, porque as compras do cartão
-- já são conciliadas uma a uma.
--
-- O pagamento quase sempre aparece em par: saída na conta corrente e entrada
-- no cartão, com o mesmo valor e em poucos dias. Então:
--   1. quando um lado é reconhecido, o outro lado (mesmo valor, sinal oposto,
--      um no cartão e outro fora dele, até 7 dias de diferença) também é;
--   2. `mark_bill_payment(id)`: o usuário marca à mão, na Conciliação, um
--      pagamento que escapou; o par dele vai junto.
-- Pagamento de fatura fica reprovado (fora dos números), como na 0009.

create or replace function public.is_card_type(account_type text)
returns boolean
language sql
immutable
as $$
  select upper(coalesce(account_type, '')) in ('CREDIT_CARD', 'CREDIT')
$$;

-- Ids das transações que formam par com `target` (o outro lado do pagamento).
create or replace function public.bill_payment_pairs(target uuid)
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  select other.id
    from public.transactions t
    join public.accounts ta on ta.id = t.account_id
    join public.transactions other
      on other.user_id = t.user_id
     and other.id <> t.id
     and other.account_id <> t.account_id
     and other.amount = -t.amount
     and abs(other.transaction_date - t.transaction_date) <= 7
    join public.accounts oa on oa.id = other.account_id
   where t.id = target
     and public.is_card_type(ta.type) <> public.is_card_type(oa.type)
     and not other.bill_payment
     -- Só mexe no que ainda não foi decidido: aprovado à mão fica como está.
     and other.reconciliation_status = 'pending'
$$;

create or replace function public.flag_as_bill_payment(ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.transactions
     set bill_payment = true,
         reconciliation_status = 'rejected',
         reconciled_at = now(),
         notes = coalesce(notes, 'Pagamento de fatura — reprovado automaticamente')
   where id = any(ids)
$$;

-- 1. Automático: depois de cada inserção, casa o pagamento com o outro lado.
create or replace function public.pair_bill_payment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.bill_payment then
    -- Este lado foi reconhecido: leva o outro junto.
    perform public.flag_as_bill_payment(array(select public.bill_payment_pairs(new.id)));
  elsif new.reconciliation_status = 'pending' and exists (
    select 1
      from public.transactions other
      join public.accounts oa on oa.id = other.account_id
      join public.accounts na on na.id = new.account_id
     where other.user_id = new.user_id
       and other.bill_payment
       and other.account_id <> new.account_id
       and other.amount = -new.amount
       and abs(other.transaction_date - new.transaction_date) <= 7
       and public.is_card_type(oa.type) <> public.is_card_type(na.type)
  ) then
    -- O outro lado já era pagamento de fatura: este também é.
    perform public.flag_as_bill_payment(array[new.id]);
  end if;
  return null;
end;
$$;

drop trigger if exists transactions_pair_bill_payment on public.transactions;
create trigger transactions_pair_bill_payment
  after insert on public.transactions
  for each row execute function public.pair_bill_payment();

-- 2. Manual: "É pagamento de fatura" na Conciliação. Devolve os ids marcados
--    (o escolhido e o par, se houver) para a tela tirá-los da fila.
create or replace function public.mark_bill_payment(target uuid)
returns setof uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  ids uuid[];
begin
  if not exists (select 1 from public.transactions where id = target and user_id = auth.uid()) then
    raise exception 'Transação não encontrada' using errcode = 'no_data_found';
  end if;
  ids := array[target] || array(select public.bill_payment_pairs(target));
  perform public.flag_as_bill_payment(ids);
  return query select unnest(ids);
end;
$$;

revoke execute on function public.mark_bill_payment(uuid) from public, anon;
grant execute on function public.mark_bill_payment(uuid) to authenticated;

-- Aplica ao que já está na fila: pendente cujo par já é pagamento de fatura.
select public.flag_as_bill_payment(array(
  select p.id
    from public.transactions b
    cross join lateral public.bill_payment_pairs(b.id) as p(id)
   where b.bill_payment
));

notify pgrst, 'reload schema';
