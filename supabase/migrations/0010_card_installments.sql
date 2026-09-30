-- VINTE — parcelas das compras no cartão de crédito
--
-- O Pluggy manda cada parcela como uma transação, com "parcela 6 de 8" em
-- `creditCardMetadata`. Guardamos isso (só para contas de cartão) para:
--   - mostrar "6/8" ao lado da compra;
--   - prever quanto vem em cada fatura futura, projetando as parcelas que
--     ainda não apareceram.
--
-- Os campos ficam nulos em conta corrente e em compra à vista.

alter table public.transactions
  add column if not exists installment_number int check (installment_number >= 1),
  add column if not exists total_installments int check (total_installments >= 1),
  add column if not exists purchase_date date,
  add column if not exists pluggy_bill_id text;

create index if not exists transactions_installments_idx
  on public.transactions(user_id, account_id)
  where total_installments > 1;
