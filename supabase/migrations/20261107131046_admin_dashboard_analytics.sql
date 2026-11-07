-- Kantu Floral · Dashboard analítico del panel administrador.
-- Una sola RPC agregada (plan gratuito: una consulta en vez de decenas).
-- Solo administradores; ejecución denegada para anon/public.

create or replace function public.admin_dashboard_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_tz constant text := 'America/Lima';
    v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
    v_today date := (now() at time zone 'America/Lima')::date;
    v_start date;
    v_prev_start date;
    v_result jsonb;
begin
    if not public.is_admin() then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;

    v_start := v_today - (v_days - 1);
    v_prev_start := v_start - v_days;

    with base as (
        select
            o.id,
            o.user_id,
            o.customer_phone,
            o.total,
            o.status,
            o.payment_status,
            o.payment_provider,
            o.discount_amount,
            o.delivery_fee,
            o.created_at,
            o.paid_at,
            o.delivered_at,
            (o.created_at at time zone v_tz)::date as d,
            (o.payment_status = 'approved' and o.status <> 'cancelado') as paid
        from public.orders o
        where o.created_at >= (v_prev_start::timestamp at time zone v_tz)
    ),
    cur as (select * from base where d >= v_start),
    prev as (select * from base where d < v_start),
    cur_items as (
        select oi.product_id, oi.quantity, oi.unit_price
        from cur
        join public.order_items oi on oi.order_id = cur.id
        where cur.paid
    )
    select jsonb_build_object(
        'range', jsonb_build_object(
            'days', v_days,
            'start', v_start,
            'end', v_today,
            'generated_at', now()
        ),
        'kpis', jsonb_build_object(
            'revenue', (select coalesce(sum(total) filter (where paid), 0) from cur),
            'revenue_prev', (select coalesce(sum(total) filter (where paid), 0) from prev),
            'orders', (select count(*) from cur),
            'orders_prev', (select count(*) from prev),
            'paid_orders', (select count(*) filter (where paid) from cur),
            'paid_orders_prev', (select count(*) filter (where paid) from prev),
            'customers', (select count(distinct coalesce(user_id::text, customer_phone)) filter (where paid) from cur),
            'customers_prev', (select count(distinct coalesce(user_id::text, customer_phone)) filter (where paid) from prev),
            'cancelled', (select count(*) filter (where status = 'cancelado') from cur),
            'discounts', (select coalesce(sum(discount_amount) filter (where paid), 0) from cur),
            'delivery_fees', (select coalesce(sum(delivery_fee) filter (where paid), 0) from cur),
            'avg_fulfillment_minutes', (
                select round(avg(extract(epoch from (delivered_at - paid_at)) / 60.0))
                from cur
                where paid and delivered_at is not null and paid_at is not null and delivered_at > paid_at
            )
        ),
        'series', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'date', g.day,
                'revenue', coalesce(r.revenue, 0),
                'orders', coalesce(r.orders, 0)
            ) order by g.day), '[]'::jsonb)
            from (select generate_series(v_start, v_today, interval '1 day')::date as day) g
            left join (
                select d, sum(total) filter (where paid) as revenue, count(*) as orders
                from cur
                group by d
            ) r on r.d = g.day
        ),
        'series_prev', (
            select coalesce(jsonb_agg(coalesce(r.revenue, 0) order by g.day), '[]'::jsonb)
            from (select generate_series(v_prev_start, v_start - 1, interval '1 day')::date as day) g
            left join (
                select d, sum(total) filter (where paid) as revenue
                from prev
                group by d
            ) r on r.d = g.day
        ),
        'status', (
            select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
            from (select status, count(*) as n from cur group by status) s
        ),
        'payment_status', (
            select coalesce(jsonb_object_agg(payment_status, n), '{}'::jsonb)
            from (select payment_status, count(*) as n from cur group by payment_status) s
        ),
        'providers', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'provider', provider,
                'orders', n,
                'revenue', revenue
            ) order by revenue desc), '[]'::jsonb)
            from (
                select coalesce(nullif(payment_provider, ''), 'otro') as provider,
                       count(*) as n,
                       sum(total) as revenue
                from cur
                where paid
                group by 1
            ) p
        ),
        'top_products', (
            select coalesce(jsonb_agg(t order by t.revenue desc), '[]'::jsonb)
            from (
                select p.id, p.name, p.image, p.category,
                       sum(ci.quantity)::int as units,
                       sum(ci.quantity * ci.unit_price) as revenue
                from cur_items ci
                join public.products p on p.id = ci.product_id
                group by p.id, p.name, p.image, p.category
                order by revenue desc
                limit 6
            ) t
        ),
        'categories', (
            select coalesce(jsonb_agg(c order by c.revenue desc), '[]'::jsonb)
            from (
                select coalesce(p.category, 'otros') as category,
                       sum(ci.quantity)::int as units,
                       sum(ci.quantity * ci.unit_price) as revenue
                from cur_items ci
                join public.products p on p.id = ci.product_id
                group by 1
            ) c
        ),
        'heatmap', (
            select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'orders', n)), '[]'::jsonb)
            from (
                select extract(isodow from created_at at time zone v_tz)::int as dow,
                       extract(hour from created_at at time zone v_tz)::int as hr,
                       count(*) as n
                from cur
                group by 1, 2
            ) h
        ),
        'inventory', (
            select jsonb_build_object(
                'active', count(*) filter (where active),
                'inactive', count(*) filter (where not active),
                'low_stock', count(*) filter (where active and stock > 0 and stock <= 5),
                'out_of_stock', count(*) filter (where active and stock <= 0),
                'stock_value', coalesce(sum(price * greatest(stock, 0)) filter (where active), 0)
            )
            from public.products
        ),
        'low_stock_items', (
            select coalesce(jsonb_agg(l order by l.stock asc, l.name asc), '[]'::jsonb)
            from (
                select id, name, stock, image, category
                from public.products
                where active and stock <= 5
                order by stock asc, name asc
                limit 6
            ) l
        ),
        'recent_orders', (
            select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb)
            from (
                select o.id, o.customer_name, o.total, o.status, o.payment_status,
                       o.payment_provider, o.created_at
                from public.orders o
                order by o.created_at desc
                limit 8
            ) r
        ),
        'pending', jsonb_build_object(
            'payment_proofs', (
                select count(*) from public.payment_proofs pp
                where pp.verification_status in ('uploaded', 'verifying', 'needs_review')
            ),
            'unpaid_orders', (
                select count(*) from public.orders o
                where o.status = 'pendiente' and o.payment_status = 'pending'
            ),
            'to_prepare', (
                select count(*) from public.orders o
                where o.payment_status = 'approved' and o.status in ('confirmado', 'preparando')
            ),
            'in_delivery', (
                select count(*) from public.orders o
                where o.status = 'en_camino'
            )
        ),
        'customers', (
            select jsonb_build_object(
                'registered', (select count(*) from public.profiles where role = 'customer'),
                'new_in_range', (
                    select count(*) from public.profiles
                    where role = 'customer'
                      and created_at >= (v_start::timestamp at time zone v_tz)
                ),
                'repeat', (
                    select count(*) from (
                        select coalesce(o.user_id::text, o.customer_phone) as k
                        from public.orders o
                        where o.payment_status = 'approved' and o.status <> 'cancelado'
                        group by 1
                        having count(*) >= 2
                    ) x
                )
            )
        )
    )
    into v_result;

    return v_result;
end;
$$;

comment on function public.admin_dashboard_analytics(integer) is
    'Kantu Floral: métricas agregadas del dashboard admin. Requiere public.is_admin().';

revoke all on function public.admin_dashboard_analytics(integer) from public, anon;
grant execute on function public.admin_dashboard_analytics(integer) to authenticated;

-- Trigger function: nunca debe ser invocable vía RPC.
revoke all on function public.set_order_operational_timestamps() from public, anon, authenticated;

-- Tablas internas sólo accesibles por service_role: política explícita de denegación
-- para documentar la intención (y silenciar el lint rls_enabled_no_policy).
drop policy if exists "Deny client access to guest order access" on public.guest_order_access;
create policy "Deny client access to guest order access"
    on public.guest_order_access
    as restrictive
    for all
    to anon, authenticated
    using (false)
    with check (false);

drop policy if exists "Deny client access to guest checkout rate limits" on public.guest_checkout_rate_limits;
create policy "Deny client access to guest checkout rate limits"
    on public.guest_checkout_rate_limits
    as restrictive
    for all
    to anon, authenticated
    using (false)
    with check (false);
