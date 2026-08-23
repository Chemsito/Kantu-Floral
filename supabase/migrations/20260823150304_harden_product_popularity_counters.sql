alter table public.products
  add column if not exists paid_order_count bigint not null default 0,
  add column if not exists units_sold bigint not null default 0;

update public.products
set paid_order_count = 0,
    units_sold = 0;

with stats as (
  select
    oi.product_id,
    count(distinct oi.order_id)::bigint as paid_order_count,
    coalesce(sum(oi.quantity), 0)::bigint as units_sold
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'approved'
    and o.status <> 'cancelado'
  group by oi.product_id
)
update public.products p
set paid_order_count = s.paid_order_count,
    units_sold = s.units_sold
from stats s
where s.product_id = p.id;

create or replace function public.sync_product_popularity_from_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_counts boolean := false;
  v_new_counts boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_old_counts := old.payment_status = 'approved' and old.status <> 'cancelado';
    v_new_counts := new.payment_status = 'approved' and new.status <> 'cancelado';

    if v_old_counts = v_new_counts then
      return new;
    end if;

    if v_new_counts then
      update public.products p
      set paid_order_count = p.paid_order_count + 1,
          units_sold = p.units_sold + oi.quantity
      from public.order_items oi
      where oi.order_id = new.id
        and oi.product_id = p.id;
    else
      update public.products p
      set paid_order_count = greatest(p.paid_order_count - 1, 0),
          units_sold = greatest(p.units_sold - oi.quantity, 0)
      from public.order_items oi
      where oi.order_id = old.id
        and oi.product_id = p.id;
    end if;

    return new;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_product_popularity_from_order() from public, anon, authenticated;

drop trigger if exists orders_sync_product_popularity on public.orders;
create trigger orders_sync_product_popularity
after update of payment_status, status on public.orders
for each row
when (old.payment_status is distinct from new.payment_status or old.status is distinct from new.status)
execute function public.sync_product_popularity_from_order();

create or replace function public.get_product_catalog_popularity()
returns table(product_id bigint, paid_order_count bigint, units_sold bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.paid_order_count, p.units_sold
  from public.products p
  where p.active = true;
$$;

revoke all on function public.get_product_catalog_popularity() from public;
grant execute on function public.get_product_catalog_popularity() to anon, authenticated;
