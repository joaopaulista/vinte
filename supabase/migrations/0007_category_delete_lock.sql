-- VINTE — trava na exclusão de categorias
--
-- Antes: apagar uma categoria deixava as transações dela "sem categoria"
-- (on delete set null), sem aviso. Agora o próprio banco recusa a exclusão
-- enquanto houver transação apontando para ela ou para uma subcategoria dela
-- — a trava vale mesmo para quem chamar a API por fora do app.
--
-- Para apagar, as transações precisam ser movidas antes. A função
-- `reassign_and_delete_category` faz as duas coisas numa transação só.

alter table public.transactions
  drop constraint if exists transactions_category_id_fkey,
  add constraint transactions_category_id_fkey
    foreign key (category_id) references public.categories(id) on delete restrict;

alter table public.transactions
  drop constraint if exists transactions_subcategory_id_fkey,
  add constraint transactions_subcategory_id_fkey
    foreign key (subcategory_id) references public.categories(id) on delete restrict;

-- Transações que usam a categoria, contando as das subcategorias dela.
create or replace function public.category_usage(target uuid)
returns integer
language sql
stable
security invoker
as $$
  select count(*)::int
    from public.transactions t
   where t.category_id = target
      or t.subcategory_id = target
      or t.subcategory_id in (
        select c.id from public.categories c where c.parent_category_id = target
      )
$$;

/* Move transações e regras de `target` (e das subcategorias dele) para
   `new_category`/`new_subcategory` e então apaga `target`.
   SECURITY INVOKER: a RLS garante que só mexe nos dados de quem chama. */
create or replace function public.reassign_and_delete_category(
  target uuid,
  new_category uuid,
  new_subcategory uuid default null
)
returns integer
language plpgsql
security invoker
as $$
declare
  moved int;
begin
  if new_category is null then
    raise exception 'Escolha a categoria de destino.';
  end if;

  if new_category = target
     or new_subcategory = target
     or exists (
       select 1 from public.categories c
        where c.parent_category_id = target
          and c.id in (new_category, new_subcategory)
     ) then
    raise exception 'O destino não pode ser a própria categoria que será apagada.';
  end if;

  if not exists (
    select 1 from public.categories c
     where c.id = new_category and c.parent_category_id is null
  ) then
    raise exception 'Categoria de destino inválida.';
  end if;

  if new_subcategory is not null and not exists (
    select 1 from public.categories c
     where c.id = new_subcategory and c.parent_category_id = new_category
  ) then
    raise exception 'A subcategoria de destino não pertence à categoria escolhida.';
  end if;

  update public.transactions t
     set category_id = new_category,
         subcategory_id = new_subcategory
   where t.category_id = target
      or t.subcategory_id = target
      or t.subcategory_id in (
        select c.id from public.categories c where c.parent_category_id = target
      );
  get diagnostics moved = row_count;

  -- Regras de sugestão seguem junto, para não voltarem a sugerir o que sumiu.
  update public.category_rules r
     set category_id = new_category,
         subcategory_id = new_subcategory
   where r.category_id = target
      or r.subcategory_id = target
      or r.subcategory_id in (
        select c.id from public.categories c where c.parent_category_id = target
      );

  delete from public.categories where id = target;

  if not found then
    raise exception 'Categoria não encontrada ou sem permissão para apagar.';
  end if;

  return moved;
end;
$$;
