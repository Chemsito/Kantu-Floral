insert into public.delivery_pricing_settings (
  settings_key, origin_lat, origin_lng, road_factor, base_fee, included_km,
  rate_2_5, rate_5_10, rate_over_10, max_distance_km
) values (
  'default', -16.4098229, -71.5223031, 1.25, 5.00, 2.00,
  1.20, 1.50, 1.80, 25.00
)
on conflict (settings_key) do nothing;

create or replace function public.get_product_catalog_popularity()
returns table(product_id bigint, paid_order_count bigint, units_sold bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    oi.product_id,
    count(distinct oi.order_id)::bigint as paid_order_count,
    coalesce(sum(oi.quantity), 0)::bigint as units_sold
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'approved'
    and o.status <> 'cancelado'
  group by oi.product_id;
$$;

revoke all on function public.get_product_catalog_popularity() from public;
grant execute on function public.get_product_catalog_popularity() to anon, authenticated;
