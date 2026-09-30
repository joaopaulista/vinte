-- VINTE — cada usuário precisa ter pelo menos 1 categoria
--
-- Sem categoria nenhuma não dá para conciliar: a aprovação exige categoria.
-- A regra vale no banco (e não só na tela) para ninguém contornar pela API.
--
-- Complementa a 0007: lá, a categoria em uso não pode ser apagada; aqui, a
-- última categoria do usuário também não.
--
-- A checagem roda no fim do comando (FOR EACH STATEMENT), olhando o que
-- sobrou. Uma checagem linha a linha deixaria passar um único DELETE que
-- apaga todas de uma vez, porque cada linha ainda "vê" as outras.

create or replace function public.ensure_category_remains()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
      from deleted d
     where d.user_id is not null            -- categorias padrão não contam
       and d.parent_category_id is null     -- subcategoria não conta
       -- exclusão da conta: o usuário já saiu de auth.users e as categorias
       -- vão junto em cascata; aí a regra não se aplica
       and exists (select 1 from auth.users u where u.id = d.user_id)
       and not exists (
         select 1 from public.categories c
          where c.user_id = d.user_id and c.parent_category_id is null
       )
  ) then
    raise exception 'É preciso manter pelo menos 1 categoria.'
      using errcode = 'P0001';
  end if;

  return null;
end;
$$;

drop trigger if exists categories_keep_one on public.categories;
create trigger categories_keep_one
  after delete on public.categories
  referencing old table as deleted
  for each statement execute function public.ensure_category_remains();
