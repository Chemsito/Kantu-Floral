alter table public.products
    add column if not exists size text,
    add column if not exists note text;

update public.products
set category = case
    when category = 'especiales' then 'tulipanes'
    when category = 'arreglos' then 'flores'
    else category
end
where category in ('especiales', 'arreglos');

update public.products
set size = 'M'
where size is null or btrim(size) = '';

update public.products
set size = 'XL'
where size = 'M'
  and (
      name ilike '%100 rosas%'
      or coalesce(description, '') ~* '(^|[^a-z])XL([^a-z]|$)'
  );

alter table public.products
    alter column size set default 'M',
    alter column size set not null;

alter table public.products
    drop constraint if exists products_size_check;

alter table public.products
    add constraint products_size_check
    check (size in ('S', 'M', 'L', 'XL', 'XXL'));

alter table public.products
    drop constraint if exists products_category_check;

alter table public.products
    add constraint products_category_check
    check (category in (
        'tulipanes',
        'girasoles',
        'ramos',
        'rosas',
        'box',
        'canasta',
        'flores',
        'complementos',
        'cajas',
        'ramos_buchones'
    ));
