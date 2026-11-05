-- VINTE — uma conciliação por compra parcelada
--
-- Compra parcelada no cartão chega como várias transações: o banco manda as
-- parcelas futuras logo depois da compra (ou uma por mês). Conciliar cada
-- uma é repetir a mesma decisão. Agora:
--
-- 1. Parcela sem dados de parcela do Pluggy, mas com a marcação no título
--    ("PARC 03/05", "PARCELA 3 DE 5", "... 03/05" no fim), ganha
--    `installment_number`/`total_installments` lidos do título (só cartão).
-- 2. Conciliou uma parcela (aprovou ou reprovou)? As outras parcelas
--    pendentes da mesma compra recebem a mesma decisão e categoria.
-- 3. Parcela que chega depois de a compra já ter sido conciliada entra
--    direto com a mesma decisão e categoria — não volta para a fila.
--
-- "Mesma compra": mesma conta, mesmo título sem a marcação de parcela, mesmo
-- total de parcelas e mesma data de compra (sem ela, mesmo valor em reais).

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------

-- Título sem a marcação de parcela, sem acento, só letras e números.
create or replace function public.installment_base_name(description text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
           regexp_replace(
             public.normalize_text(description),
             '(parc(ela)?\.?\s*)?\m\d{1,2}\s*(/|de)\s*\d{1,2}\M', ' ', 'g'),
           '[^a-z0-9]+', ' ', 'g'))
$$;

-- Chave da compra: as parcelas da mesma compra têm a mesma chave.
create or replace function public.installment_key(
  account_id uuid,
  description text,
  total int,
  purchase date,
  amount numeric
)
returns text
language sql
immutable
as $$
  select case when coalesce(total, 1) <= 1 then null else
    account_id::text || '|' || public.installment_base_name(description) || '|' || total || '|' ||
    coalesce(purchase::text, round(abs(amount))::text)
  end
$$;

-- Lê "3/5" do título: "PARC 03/05", "PARCELA 3 DE 5" ou "03/05" no fim.
create or replace function public.installment_from_title(description text)
returns int[]
language plpgsql
immutable
as $$
declare
  t text := public.normalize_text(description);
  m text[];
begin
  m := regexp_match(t, 'parc(?:ela)?\.?\s*(\d{1,2})\s*(?:/|de)\s*(\d{1,2})');
  if m is null then
    m := regexp_match(t, '\s(\d{1,2})\s*/\s*(\d{1,2})\s*$');
  end if;
  if m is null then return null; end if;
  if m[1]::int between 1 and m[2]::int and m[2]::int between 2 and 48 then
    return array[m[1]::int, m[2]::int];
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1 e 3. Na chegada: lê a parcela do título e herda a decisão da compra
-- ---------------------------------------------------------------------------
create or replace function public.apply_installment_siblings()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  parsed int[];
  sibling record;
begin
  if new.installment_number is null
     and public.is_card_type((select a.type from public.accounts a where a.id = new.account_id)) then
    parsed := public.installment_from_title(new.description);
    if parsed is not null then
      new.installment_number := parsed[1];
      new.total_installments := parsed[2];
    end if;
  end if;

  -- Pagamento de fatura (0009) ou já decidido: nada a herdar.
  if new.bill_payment or new.reconciliation_status <> 'pending' or coalesce(new.total_installments, 1) <= 1 then
    return new;
  end if;

  select s.reconciliation_status, s.category_id, s.subcategory_id
    into sibling
    from public.transactions s
   where s.user_id = new.user_id
     and s.account_id = new.account_id
     and s.reconciliation_status <> 'pending'
     and not s.bill_payment
     and public.installment_key(s.account_id, s.description, s.total_installments, s.purchase_date, s.amount)
       = public.installment_key(new.account_id, new.description, new.total_installments, new.purchase_date, new.amount)
   order by s.reconciled_at desc nulls last
   limit 1;

  if found then
    new.reconciliation_status := sibling.reconciliation_status;
    new.category_id := sibling.category_id;
    new.subcategory_id := sibling.subcategory_id;
    new.auto_categorized := false;
    new.reconciled_at := now();
    new.notes := coalesce(new.notes, 'Parcela conciliada junto com a compra');
  end if;
  return new;
end;
$$;

-- "zz": roda depois dos outros gatilhos de inserção (regras, fatura, competência).
drop trigger if exists transactions_zz_installment_siblings on public.transactions;
create trigger transactions_zz_installment_siblings
  before insert on public.transactions
  for each row execute function public.apply_installment_siblings();

-- ---------------------------------------------------------------------------
-- 2. Conciliou uma parcela: as pendentes da mesma compra vão junto
-- ---------------------------------------------------------------------------
create or replace function public.propagate_installment_decision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Só a decisão do usuário propaga; a atualização das irmãs não repropaga.
  if pg_trigger_depth() > 1 then return null; end if;

  update public.transactions s
     set reconciliation_status = new.reconciliation_status,
         category_id = new.category_id,
         subcategory_id = new.subcategory_id,
         auto_categorized = false,
         reconciled_at = now(),
         notes = coalesce(s.notes, 'Parcela conciliada junto com a compra')
   where s.user_id = new.user_id
     and s.account_id = new.account_id
     and s.id <> new.id
     and s.reconciliation_status = 'pending'
     and not s.bill_payment
     and public.installment_key(s.account_id, s.description, s.total_installments, s.purchase_date, s.amount)
       = public.installment_key(new.account_id, new.description, new.total_installments, new.purchase_date, new.amount);
  return null;
end;
$$;

drop trigger if exists transactions_propagate_installment_decision on public.transactions;
create trigger transactions_propagate_installment_decision
  after update of reconciliation_status on public.transactions
  for each row
  when (old.reconciliation_status = 'pending'
        and new.reconciliation_status <> 'pending'
        and coalesce(new.total_installments, 1) > 1
        and not new.bill_payment)
  execute function public.propagate_installment_decision();

-- ---------------------------------------------------------------------------
-- Aplica ao que já existe
-- ---------------------------------------------------------------------------

-- Parcela no título das compras de cartão que vieram sem os dados do Pluggy.
update public.transactions t
   set installment_number = (public.installment_from_title(t.description))[1],
       total_installments = (public.installment_from_title(t.description))[2]
  from public.accounts a
 where a.id = t.account_id
   and public.is_card_type(a.type)
   and t.installment_number is null
   and public.installment_from_title(t.description) is not null;

-- Pendentes de uma compra que já teve parcela conciliada herdam a decisão.
with decided as (
  select distinct on (k) k, reconciliation_status, category_id, subcategory_id
    from (
      select public.installment_key(d.account_id, d.description, d.total_installments, d.purchase_date, d.amount) as k,
             d.reconciliation_status, d.category_id, d.subcategory_id, d.reconciled_at
        from public.transactions d
       where d.reconciliation_status <> 'pending'
         and not d.bill_payment
         and coalesce(d.total_installments, 1) > 1
    ) x
   order by k, reconciled_at desc nulls last
)
update public.transactions p
   set reconciliation_status = s.reconciliation_status,
       category_id = s.category_id,
       subcategory_id = s.subcategory_id,
       auto_categorized = false,
       reconciled_at = now(),
       notes = coalesce(p.notes, 'Parcela conciliada junto com a compra')
  from decided s
 where p.reconciliation_status = 'pending'
   and not p.bill_payment
   and coalesce(p.total_installments, 1) > 1
   and public.installment_key(p.account_id, p.description, p.total_installments, p.purchase_date, p.amount) = s.k;

notify pgrst, 'reload schema';
