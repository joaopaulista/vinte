-- VINTE — dados de demonstração
-- Permite usar o app (dashboard, listagem e conciliação) antes de plugar o Pluggy.
--
-- Uso, no SQL Editor do Supabase, depois de criar seu usuário:
--   select public.seed_demo_data((select id from auth.users where email = 'voce@exemplo.com'));
--
-- Regra do seed: os últimos 20 dias entram como 'pending' e sem categoria (para
-- você exercitar a tela de Conciliação); o que é mais antigo entra 'approved' e
-- categorizado (para o Dashboard ter o que mostrar).
--
-- A janela é em dias, e não "mês corrente", de propósito: rodando o seed no dia
-- 1º de um mês, a regra por mês deixaria a fila de conciliação com uma única
-- transação.

create or replace function public.seed_demo_data(target_user_id uuid)
returns text
language plpgsql
as $$
declare
  conn_id  uuid;
  acc_id   uuid;
  tpl      record;
  m        int;
  seq      int := 0;
  tx_date  date;
  tx_value numeric(14, 2);
  pending  boolean;
  inserted int := 0;
begin
  if target_user_id is null then
    raise exception 'target_user_id não pode ser nulo';
  end if;

  insert into public.bank_connections (user_id, pluggy_item_id, institution_name, status)
  values (target_user_id, 'demo-item-' || target_user_id, 'Banco Demo (Sandbox)', 'active')
  on conflict (user_id, pluggy_item_id) do update set status = 'active'
  returning id into conn_id;

  insert into public.accounts (user_id, bank_connection_id, pluggy_account_id, name, type, balance)
  values (target_user_id, conn_id, 'demo-acc-' || target_user_id, 'Conta Corrente Demo', 'CHECKING', 12450.75)
  on conflict (user_id, pluggy_account_id) do update set balance = excluded.balance
  returning id into acc_id;

  -- limpa um seed anterior para que rodar de novo não duplique
  delete from public.transactions where account_id = acc_id;

  for m in 0..4 loop
    for tpl in
      select * from (values
        ('PAGAMENTO SALARIO EMPRESA XPTO',  8500.00, '11111111-1111-4111-8111-00000000000a', '22222222-2222-4222-8222-000000000026',  5),
        ('ALUGUEL APTO 302 IMOB CENTRO',   -2200.00, '11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000001', 10),
        ('CONDOMINIO EDIF AURORA',          -480.00, '11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000002', 10),
        ('ENEL DISTRIBUICAO SP',            -180.00, '11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000003', 12),
        ('SABESP CONTA DE AGUA',             -95.00, '11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000004', 12),
        ('VIVO FIBRA 300MB',                -119.90, '11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000005', 15),
        ('PAO DE ACUCAR 1042',              -640.00, '11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-000000000008',  8),
        ('ASSAI ATACADISTA 77',             -310.00, '11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-000000000008', 22),
        ('IFOOD *IFD BRASIL',                -87.50, '11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-00000000000a', 18),
        ('RESTAURANTE MADERO SHOPPING',     -145.00, '11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-000000000009', 25),
        ('POSTO IPIRANGA AV PAULISTA',      -280.00, '11111111-1111-4111-8111-000000000003', '22222222-2222-4222-8222-00000000000c', 14),
        ('UBER *TRIP HELP.UBER.COM',         -62.40, '11111111-1111-4111-8111-000000000003', '22222222-2222-4222-8222-00000000000d', 19),
        ('UNIMED SAO PAULO',                -720.00, '11111111-1111-4111-8111-000000000004', '22222222-2222-4222-8222-000000000011',  7),
        ('DROGASIL FILIAL 88',              -134.20, '11111111-1111-4111-8111-000000000004', '22222222-2222-4222-8222-000000000012', 21),
        ('SMART FIT ACADEMIA',              -119.90, '11111111-1111-4111-8111-000000000004', '22222222-2222-4222-8222-000000000014',  6),
        ('NETFLIX.COM',                      -55.90, '11111111-1111-4111-8111-000000000006', '22222222-2222-4222-8222-000000000018',  3),
        ('SPOTIFY BRASIL',                   -34.90, '11111111-1111-4111-8111-000000000006', '22222222-2222-4222-8222-000000000018',  3),
        ('MERCADO LIVRE *ML',               -230.00, '11111111-1111-4111-8111-000000000007', '22222222-2222-4222-8222-00000000001d', 17),
        ('RENNER FILIAL 0234',              -189.00, '11111111-1111-4111-8111-000000000007', '22222222-2222-4222-8222-00000000001c', 24),
        ('TARIFA PACOTE DE SERVICOS',        -34.00, '11111111-1111-4111-8111-000000000009', '22222222-2222-4222-8222-000000000024',  1),
        ('RENDIMENTO CDB LIQUIDEZ',          210.00, '11111111-1111-4111-8111-00000000000b', '22222222-2222-4222-8222-00000000002c', 28),
        ('APLICACAO TESOURO DIRETO',       -1000.00, '11111111-1111-4111-8111-00000000000b', '22222222-2222-4222-8222-00000000002a',  6),
        -- Sem regra correspondente de propósito: a fila precisa mostrar que a
        -- automação não resolve tudo sozinha.
        ('TED RECEBIDA ACME CONSULT',       1800.00, '11111111-1111-4111-8111-00000000000a', '22222222-2222-4222-8222-000000000027', 20),
        ('PIX RECEBIDO REEMBOLSO VIAGEM',    150.00, '11111111-1111-4111-8111-00000000000a', '22222222-2222-4222-8222-000000000028', 16)
      ) as t(description, amount, category_id, subcategory_id, day_of_month)
    loop
      seq := seq + 1;
      tx_date := (date_trunc('month', current_date) - (m::text || ' months')::interval)::date
                 + (tpl.day_of_month - 1);

      -- não cria lançamentos no futuro dentro do mês corrente
      continue when tx_date > current_date;

      pending := tx_date > current_date - interval '20 days';

      -- variação de +/- 8% para os valores não ficarem idênticos todo mês.
      -- O cast é obrigatório: random() é double precision e round(double, int)
      -- não existe no Postgres — só round(numeric, int).
      tx_value := round((tpl.amount * (1 + (random() - 0.5) * 0.16))::numeric, 2);

      insert into public.transactions (
        user_id, account_id, pluggy_transaction_id, description, amount,
        transaction_date, type, category_id, subcategory_id,
        reconciliation_status, reconciled_at
      ) values (
        target_user_id,
        acc_id,
        'demo-' || target_user_id || '-' || seq,
        tpl.description,
        tx_value,
        tx_date,
        case when tx_value > 0 then 'CREDIT' else 'DEBIT' end,
        case when pending then null else tpl.category_id::uuid end,
        case when pending then null else tpl.subcategory_id::uuid end,
        case when pending then 'pending' else 'approved' end,
        case when pending then null else tx_date + interval '1 day' end
      );

      inserted := inserted + 1;
    end loop;
  end loop;

  return inserted || ' transações de demonstração criadas para o usuário ' || target_user_id;
end;
$$;

comment on function public.seed_demo_data(uuid) is
  'Popula conta e transações fictícias para testar o VINTE sem depender do Pluggy.';
