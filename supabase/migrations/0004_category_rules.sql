-- VINTE — categorização automática por regras
--
-- Regras de texto sobre a descrição da transação, não ML. Uma regra do usuário
-- sempre vence uma do sistema; entre regras do mesmo tipo, ganha a de menor
-- `priority` e, no empate, a de padrão mais longo (mais específica).
--
-- A sugestão preenche `category_id` mas NÃO aprova nada: a transação continua
-- `pending` e passa pela Conciliação. A automação economiza digitação, não
-- substitui a conferência.

create extension if not exists unaccent;

-- Precisa ser IMMUTABLE para poder ser usada em índice e em comparação.
create or replace function public.normalize_text(value text)
returns text
language sql
immutable
parallel safe
as $$ select unaccent(lower(coalesce(value, ''))) $$;

create table if not exists public.category_rules (
  id             uuid primary key default gen_random_uuid(),
  -- null = regra padrão do sistema, visível para todos
  user_id        uuid references auth.users(id) on delete cascade,
  pattern        text not null check (length(pattern) >= 3),
  category_id    uuid not null references public.categories(id) on delete cascade,
  subcategory_id uuid references public.categories(id) on delete set null,
  priority       int not null default 50,
  created_at     timestamptz not null default now(),
  unique (user_id, pattern)
);

create index if not exists category_rules_user_idx on public.category_rules(user_id);

alter table public.category_rules enable row level security;

drop policy if exists "category_rules_select" on public.category_rules;
create policy "category_rules_select" on public.category_rules
  for select using (user_id is null or auth.uid() = user_id);

drop policy if exists "category_rules_insert" on public.category_rules;
create policy "category_rules_insert" on public.category_rules
  for insert with check (auth.uid() = user_id);

drop policy if exists "category_rules_update" on public.category_rules;
create policy "category_rules_update" on public.category_rules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "category_rules_delete" on public.category_rules;
create policy "category_rules_delete" on public.category_rules
  for delete using (auth.uid() = user_id);

-- Marca as transações cuja categoria veio de uma regra, para a UI sinalizar
-- "sugerida" e para dar como medir a taxa de acerto mais adiante.
alter table public.transactions
  add column if not exists auto_categorized boolean not null default false;

-- ---------------------------------------------------------------------------
-- Aplicação das regras
-- ---------------------------------------------------------------------------
create or replace function public.match_category_rule(
  target_user_id uuid,
  description text
)
returns table (category_id uuid, subcategory_id uuid)
language sql
stable
as $$
  select cr.category_id, cr.subcategory_id
  from public.category_rules cr
  where (cr.user_id is null or cr.user_id = target_user_id)
    and public.normalize_text(description) like '%' || public.normalize_text(cr.pattern) || '%'
  order by (cr.user_id is not null) desc, cr.priority asc, length(cr.pattern) desc
  limit 1
$$;

/* Roda em toda inserção — cobre a sincronização do Pluggy, o webhook e o seed
   de demonstração de uma vez só, sem cada caminho precisar lembrar de chamar. */
create or replace function public.apply_category_rule()
returns trigger
language plpgsql
as $$
declare
  match record;
begin
  if new.category_id is not null then
    return new;
  end if;

  select * into match from public.match_category_rule(new.user_id, new.description);

  if found then
    new.category_id := match.category_id;
    new.subcategory_id := match.subcategory_id;
    new.auto_categorized := true;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_apply_category_rule on public.transactions;
create trigger transactions_apply_category_rule
  before insert on public.transactions
  for each row execute function public.apply_category_rule();

/* Reaplica as regras nas pendentes que ainda estão sem categoria — usado pelo
   botão "Sugerir categorias" e depois de criar regras novas.
   SECURITY INVOKER de propósito: a RLS limita o alcance às linhas do chamador. */
create or replace function public.apply_rules_to_pending()
returns integer
language plpgsql
security invoker
as $$
declare
  affected int;
begin
  with matched as (
    select t.id, r.category_id, r.subcategory_id
    from public.transactions t
    cross join lateral public.match_category_rule(t.user_id, t.description) r
    where t.reconciliation_status = 'pending'
      and t.category_id is null
  )
  update public.transactions t
     set category_id = m.category_id,
         subcategory_id = m.subcategory_id,
         auto_categorized = true
    from matched m
   where t.id = m.id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.apply_rules_to_pending() is
  'Sugere categoria para as transações pendentes ainda sem classificação.';
