-- El ledger registra hechos objetivos; no infiere una causa que no puede demostrar.

alter table public.inventory_movements
  drop constraint if exists inventory_movements_source_check;

update public.inventory_movements
set source = case
  when source = 'product_created' then 'product_created'
  when quantity_delta > 0 then 'stock_increase'
  else 'stock_decrease'
end
where source not in ('product_created', 'stock_increase', 'stock_decrease');

alter table public.inventory_movements
  add constraint inventory_movements_source_check
  check (source in ('product_created', 'stock_increase', 'stock_decrease'));

create or replace function public.log_product_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after integer;
  v_delta integer;
  v_actor uuid;
  v_source text;
begin
  if tg_op = 'INSERT' then
    v_before := 0;
    v_after := coalesce(new.stock, 0);
    v_delta := v_after;
    if v_delta = 0 then return new; end if;
    v_source := 'product_created';
  else
    v_before := coalesce(old.stock, 0);
    v_after := coalesce(new.stock, 0);
    v_delta := v_after - v_before;
    if v_delta = 0 then return new; end if;
    v_actor := auth.uid();
    v_source := case when v_delta > 0 then 'stock_increase' else 'stock_decrease' end;
  end if;

  insert into public.inventory_movements (
    product_id,
    product_name,
    quantity_delta,
    balance_before,
    balance_after,
    source,
    actor_user_id
  ) values (
    new.id,
    coalesce(nullif(btrim(new.name), ''), 'Producto'),
    v_delta,
    v_before,
    v_after,
    v_source,
    v_actor
  );

  return new;
end;
$$;

revoke all on function public.log_product_stock_movement() from public, anon, authenticated;
