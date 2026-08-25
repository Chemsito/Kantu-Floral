-- Amplía la campana del cliente con estado de pedido y fechas importantes.

create or replace function public.get_customer_notification_feed()
returns table (
    notification_key text,
    kind text,
    title text,
    body text,
    severity text,
    action_url text,
    created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
    with valid_promotions as (
        select p.*
        from public.promotion_codes p
        where p.active
          and (p.starts_at is null or p.starts_at <= now())
          and (p.ends_at is null or p.ends_at > now())
          and (
              p.max_redemptions is null
              or (select count(*) from public.orders o where o.promotion_id = p.id and o.status <> 'cancelado') < p.max_redemptions
          )
        order by coalesce(p.ends_at, now() + interval '10 years'), p.id desc
        limit 8
    ), featured_products as (
        select p.*
        from public.products p
        where p.active and p.featured and p.stock > 0
        order by p.created_at desc nulls last, p.id desc
        limit 10
    ), my_orders as (
        select o.*
        from public.orders o
        where auth.uid() is not null
          and o.user_id = auth.uid()
          and o.created_at >= now() - interval '30 days'
          and o.status <> 'cancelado'
        order by o.created_at desc
        limit 5
    ), my_due_dates as (
        select r.*
        from public.get_my_occasion_reminders() r
        where auth.uid() is not null and r.enabled and r.is_due
        order by r.days_until asc, r.id
        limit 5
    ), feed as (
        select
            'promo:' || p.id::text as notification_key,
            'promotion'::text as kind,
            ('Código ' || p.code || ' disponible')::text as title,
            coalesce(nullif(p.description, ''),
                case when p.discount_type = 'percent'
                    then trim(to_char(p.discount_value, 'FM999999990.##')) || '% de descuento'
                    else 'S/ ' || trim(to_char(p.discount_value, 'FM999999990.00')) || ' de descuento'
                end
            )::text as body,
            'benefit'::text as severity,
            '#catalogo'::text as action_url,
            p.created_at
        from valid_promotions p

        union all

        select
            'trend:' || p.id::text,
            'trend'::text,
            'Destacado por Kantu'::text,
            (p.name || ' está disponible por S/ ' || trim(to_char(p.price, 'FM999999990.00')))::text,
            'info'::text,
            ('producto.html?id=' || p.id::text)::text,
            coalesce(p.created_at, now())
        from featured_products p

        union all

        select
            'order:' || o.id::text || ':' || o.status || ':' || o.payment_status,
            'order'::text,
            case
                when o.payment_status = 'approved' and o.status = 'confirmado' then 'Tu pedido fue confirmado'
                when o.status = 'preparando' then 'Estamos preparando tu pedido'
                when o.status = 'en_camino' then 'Tu pedido está en camino'
                when o.status = 'entregado' then 'Tu pedido fue entregado'
                when o.payment_status = 'rejected' then 'Revisa el pago de tu pedido'
                else 'Actualización de tu pedido'
            end::text,
            ('Pedido #' || o.id::text || ' · ' ||
                case o.status
                    when 'pendiente' then 'pendiente'
                    when 'confirmado' then 'confirmado'
                    when 'preparando' then 'en preparación'
                    when 'en_camino' then 'en camino'
                    when 'entregado' then 'entregado'
                    else o.status
                end
            )::text,
            case when o.payment_status = 'rejected' then 'warning' else 'order' end::text,
            '#inicio'::text,
            coalesce(o.paid_at, o.created_at)
        from my_orders o

        union all

        select
            'occasion:' || r.id::text || ':' || r.next_occurrence::text,
            'occasion'::text,
            ('Se acerca: ' || r.label)::text,
            case when r.days_until = 0 then 'Es hoy. Si quieres regalar flores, aún estás a tiempo.'
                 when r.days_until = 1 then 'Es mañana. Puedes elegir y programar el regalo desde Kantu.'
                 else ('Faltan ' || r.days_until::text || ' días. Puedes preparar el regalo con anticipación.') end::text,
            'reminder'::text,
            '#catalogo'::text,
            now()
        from my_due_dates r
    )
    select f.notification_key, f.kind, f.title, f.body, f.severity, f.action_url, f.created_at
    from feed f
    order by f.created_at desc
    limit 25;
$$;

revoke all on function public.get_customer_notification_feed() from public;
grant execute on function public.get_customer_notification_feed() to anon, authenticated;
