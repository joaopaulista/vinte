-- VINTE — transações ainda em aberto no banco
--
-- A sincronização descartava toda transação que o Pluggy manda com status
-- PENDING. No cartão de crédito, vários bancos deixam assim as compras da
-- fatura aberta até o fechamento — e elas simplesmente não apareciam no VINTE.
--
-- Agora elas entram, marcadas com `bank_status = 'PENDING'`. A cada sync a
-- Edge Function atualiza valor, data e descrição com o que o banco mandar
-- (quando a compra é liquidada, vira POSTED) e apaga as que o banco deixou de
-- mandar dentro da janela sincronizada (compra cancelada, ou substituída por
-- outra já liquidada com outro id).

alter table public.transactions
  add column if not exists bank_status text not null default 'POSTED'
    check (bank_status in ('PENDING', 'POSTED'));

notify pgrst, 'reload schema';
