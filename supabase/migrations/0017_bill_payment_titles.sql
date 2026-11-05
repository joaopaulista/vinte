-- VINTE — pagamento de fatura reconhecido por mais títulos
--
-- A 0009 só reconhecia, na conta corrente, títulos com "fatura" ou com
-- "cartão" + "crédito" + "pagamento". Cada banco escreve de um jeito e o que
-- escapava ia para a Conciliação. Esta versão lê o título com mais formas:
--
--   conta corrente (saída), havendo cartão cadastrado:
--     "fatura", "fat" como palavra ("PAG FAT", "PGTO FAT NUBANK"),
--     "cartão"/"cartões" + pagamento/pag/pagto/pgto/boleto/débito automático
--       ("PAGTO CARTAO ITAU", "DEB AUT CARTAO"),
--     "credit card", "card payment",
--     boleto pago à Nu Pagamentos ("BOLETO NU PAGAMENTOS");
--   cartão (entrada):
--     pagamento/pag/pagto/pgto/fatura/recebido/payment ("PAGAMENTO RECEBIDO").
--
-- Estorno continua de fora (é devolução de compra). O par da 0015 segue
-- valendo: reconhecido um lado, o outro vai junto.
--
-- No fim, reaplica aos pendentes, para limpar a fila de hoje.

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
  t text := ' ' || regexp_replace(public.normalize_text(description), '[^a-z0-9]+', ' ', 'g') || ' ';
  on_card boolean := public.is_card_type(account_type);
  has_card boolean;
  pays boolean := t ~ ' (pagamento|pagto|pgto|pag) ';
begin
  if t like '% estorno %' then
    return false;  -- estorno no cartão é devolução de compra, não pagamento
  end if;

  has_card := on_card or exists (
    select 1 from public.accounts a where a.user_id = owner and public.is_card_type(a.type)
  );

  if lower(coalesce(pluggy_category, '')) = 'credit card payment' then
    return has_card;
  end if;

  if on_card then
    -- No cartão, entrada que fala em pagamento é o pagamento da fatura.
    return amount > 0
       and (pays or t ~ ' (fatura|recebido|payment) ');
  end if;

  -- Na conta corrente: saída que é pagamento de cartão, se houver cartão.
  return amount < 0
     and has_card
     and (
       t ~ ' (fatura|fat) '
       or (t ~ ' (cartao|cartoes) ' and (pays or t ~ ' (boleto|deb aut|debito automatico|debito aut) '))
       or t like '% credit card %'
       or t like '% card payment %'
       or (t like '% boleto %' and t like '% nu pagamentos %')
     );
end;
$$;

-- Reaplica aos que ainda estão na fila.
update public.transactions t
   set bill_payment = true,
       reconciliation_status = 'rejected',
       reconciled_at = now(),
       notes = coalesce(t.notes, 'Pagamento de fatura — reprovado automaticamente')
  from public.accounts a
 where a.id = t.account_id
   and t.reconciliation_status = 'pending'
   and not t.bill_payment
   and public.is_bill_payment(t.description, t.amount, a.type, t.pluggy_category, t.user_id);

-- E leva o outro lado de cada pagamento junto (regra de par da 0015).
select public.flag_as_bill_payment(array(
  select p.id
    from public.transactions b
    cross join lateral public.bill_payment_pairs(b.id) as p(id)
   where b.bill_payment
));

-- A marcação manual da 0015 saiu do app: o reconhecimento é automático.
drop function if exists public.mark_bill_payment(uuid);

notify pgrst, 'reload schema';
