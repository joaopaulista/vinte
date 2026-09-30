-- VINTE — pagamentos de fatura de cartão
--
-- Pagar a fatura não é gasto novo: o gasto já foi contado em cada compra do
-- cartão. Quando o banco e o cartão estão conectados, o pagamento aparece
-- duas vezes e distorce os números:
--   - no cartão, como entrada ("Pagamento recebido");
--   - na conta corrente, como saída ("Pagamento de fatura").
-- Os dois são marcados como `bill_payment` e reprovados automaticamente — a
-- transação continua guardada (e aparece no gráfico de faturas pagas), mas
-- sai de dashboard, análises e totais. Dá para reabrir e aprovar à mão.
--
-- Como reconhecer:
--   1. pela categoria que o próprio Pluggy dá ("Credit card payment") —
--      guardada a partir desta migration em `pluggy_category`;
--   2. pela descrição, para o histórico que já existe (sem categoria Pluggy).
-- A saída da conta corrente só é reprovada se houver cartão conectado: sem o
-- cartão, o pagamento da fatura é o único registro daquele gasto.

alter table public.transactions
  add column if not exists pluggy_category text,
  add column if not exists bill_payment boolean not null default false;

create index if not exists transactions_bill_payment_idx
  on public.transactions(user_id, transaction_date)
  where bill_payment;

create or replace function public.is_bill_payment(
  description text,
  amount numeric,
  account_type text,
  pluggy_category text,
  owner uuid
)
returns boolean
language plpgsql
stable
security invoker
as $$
declare
  text_norm text := public.normalize_text(description);
  on_card boolean := upper(coalesce(account_type, '')) in ('CREDIT_CARD', 'CREDIT');
begin
  if text_norm like '%estorno%' then
    return false;  -- estorno no cartão é devolução de compra, não pagamento
  end if;

  if lower(coalesce(pluggy_category, '')) = 'credit card payment' then
    return on_card or exists (
      select 1 from public.accounts a
       where a.user_id = owner and upper(a.type) in ('CREDIT_CARD', 'CREDIT')
    );
  end if;

  if on_card then
    -- No cartão, entrada com "pagamento" é o pagamento da fatura.
    return amount > 0
       and (text_norm like '%pagamento%' or text_norm like '%pagto%'
            or text_norm like '%pgto%' or text_norm like '%fatura%');
  end if;

  -- Na conta corrente: saída que menciona fatura ou cartão de crédito.
  return amount < 0
     and (
       text_norm like '%fatura%'
       or (text_norm like '%cartao%' and text_norm like '%credito%'
           and (text_norm like '%pagamento%' or text_norm like '%pagto%' or text_norm like '%pgto%'))
     )
     and exists (
       select 1 from public.accounts a
        where a.user_id = owner and upper(a.type) in ('CREDIT_CARD', 'CREDIT')
     );
end;
$$;

create or replace function public.flag_bill_payment()
returns trigger
language plpgsql
as $$
begin
  if public.is_bill_payment(
       new.description,
       new.amount,
       (select a.type from public.accounts a where a.id = new.account_id),
       new.pluggy_category,
       new.user_id
     ) then
    new.bill_payment := true;
    new.reconciliation_status := 'rejected';
    new.reconciled_at := now();
    new.notes := coalesce(new.notes, 'Pagamento de fatura — reprovado automaticamente');
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_flag_bill_payment on public.transactions;
create trigger transactions_flag_bill_payment
  before insert on public.transactions
  for each row execute function public.flag_bill_payment();

-- Aplica ao que já foi sincronizado (inclusive o que já estava aprovado).
update public.transactions t
   set bill_payment = true,
       reconciliation_status = 'rejected',
       reconciled_at = coalesce(t.reconciled_at, now()),
       notes = coalesce(t.notes, 'Pagamento de fatura — reprovado automaticamente')
  from public.accounts a
 where a.id = t.account_id
   and not t.bill_payment
   and public.is_bill_payment(t.description, t.amount, a.type, t.pluggy_category, t.user_id);

-- Mostra o que foi marcado, para conferir no SQL Editor.
select t.transaction_date as data, a.type as conta, t.description as descricao, t.amount as valor
  from public.transactions t
  join public.accounts a on a.id = t.account_id
 where t.bill_payment
 order by t.transaction_date desc;
