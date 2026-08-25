-- Corrige los nombres de columnas del CTE y endurece la franja programada.

create or replace function public.admin_operational_alerts()
returns table (
    alert_key text,
    kind text,
    severity text,
    title text,
    body text,
    action_view text,
    entity_id text,
    minutes_waiting integer,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
    if not public.is_admin() then raise exception 'ADMIN_PERMISSION_REQUIRED'; end if;

    return query
    with alerts(alert_key, kind, severity, title, body, action_view, entity_id, minutes_waiting, created_at) as (
        select
            'claim:' || c.id::text,
            'claim'::text,
            case when extract(epoch from (now() - c.created_at))/60 >= 30 then 'urgent' else 'warning' end::text,
            ('Nuevo ' || c.complaint_type || ' · ' || c.claim_number)::text,
            (c.full_name || ' espera revisión: ' || left(c.detail, 180))::text,
            'claims'::text,
            c.id::text,
            floor(extract(epoch from (now() - c.created_at))/60)::integer,
            c.created_at
        from public.customer_claims c
        where c.status <> 'resuelto'

        union all

        select
            'payment:' || pp.id::text,
            'payment'::text,
            case when extract(epoch from (now() - pp.uploaded_at))/60 >= 10 then 'urgent' else 'warning' end::text,
            ('Verificar pago #' || pp.order_id::text)::text,
            ('El comprobante lleva ' || floor(extract(epoch from (now() - pp.uploaded_at))/60)::integer || ' min esperando revisión.')::text,
            'payments'::text,
            pp.id::text,
            floor(extract(epoch from (now() - pp.uploaded_at))/60)::integer,
            pp.uploaded_at
        from public.payment_proofs pp
        where pp.verification_status in ('uploaded','verifying','needs_review')

        union all

        select
            'order-prep:' || o.id::text,
            'order_delay'::text,
            case when extract(epoch from (now() - coalesce(o.paid_at, o.created_at)))/60 >= 25 then 'urgent' else 'warning' end::text,
            ('Pedido #' || o.id::text || ' aún no entra a preparación')::text,
            ('Pago aprobado hace ' || floor(extract(epoch from (now() - coalesce(o.paid_at, o.created_at)))/60)::integer || ' min.')::text,
            'orders'::text,
            o.id::text,
            floor(extract(epoch from (now() - coalesce(o.paid_at, o.created_at)))/60)::integer,
            coalesce(o.paid_at, o.created_at)
        from public.orders o
        where o.payment_status = 'approved'
          and o.status = 'confirmado'
          and o.prep_started_at is null
          and coalesce(o.paid_at, o.created_at) <= now() - interval '10 minutes'

        union all

        select
            'order-preparing:' || o.id::text,
            'order_delay'::text,
            'urgent'::text,
            ('Pedido #' || o.id::text || ' está demorando en preparación')::text,
            ('Lleva ' || floor(extract(epoch from (now() - o.prep_started_at))/60)::integer || ' min en preparación. Revisa qué está pasando.')::text,
            'orders'::text,
            o.id::text,
            floor(extract(epoch from (now() - o.prep_started_at))/60)::integer,
            o.prep_started_at
        from public.orders o
        where o.status = 'preparando'
          and o.prep_started_at is not null
          and o.prep_started_at <= now() - interval '45 minutes'

        union all

        select
            'order-delivery:' || o.id::text,
            'delivery_delay'::text,
            'urgent'::text,
            ('Delivery del pedido #' || o.id::text || ' está demorando')::text,
            ('Lleva ' || floor(extract(epoch from (now() - o.delivery_started_at))/60)::integer || ' min en camino. Revisa al repartidor o al cliente.')::text,
            'orders'::text,
            o.id::text,
            floor(extract(epoch from (now() - o.delivery_started_at))/60)::integer,
            o.delivery_started_at
        from public.orders o
        where o.status = 'en_camino'
          and o.delivery_started_at is not null
          and extract(epoch from (now() - o.delivery_started_at))/60 > coalesce(o.estimated_delivery_minutes, 60) + 20

        union all

        select
            'stock:' || p.id::text,
            'stock'::text,
            case when p.stock <= 1 then 'urgent' when p.stock <= 3 then 'warning' else 'info' end::text,
            case when p.stock = 0 then ('Sin stock: ' || p.name)::text else ('Stock bajo: ' || p.name)::text end,
            case when p.stock = 0 then 'El producto está agotado y ya no puede venderse.' else ('Quedan solo ' || p.stock::text || ' unidades. Considera reponerlo.') end::text,
            'products'::text,
            p.id::text,
            0,
            coalesce(p.created_at, now())
        from public.products p
        where p.active and p.stock <= 5

        union all

        select
            'scheduled:' || o.id::text || ':' || o.requested_delivery_date::text,
            'scheduled_delivery'::text,
            case
                when o.requested_delivery_date < (now() at time zone 'America/Lima')::date then 'urgent'
                when coalesce(nullif(split_part(o.requested_delivery_slot, '-', 1), ''), '23:59')::time <= (now() at time zone 'America/Lima')::time then 'urgent'
                else 'warning'
            end::text,
            ('Entrega programada pendiente #' || o.id::text)::text,
            ('Entrega solicitada para ' || o.requested_delivery_date::text || coalesce(' · ' || nullif(o.requested_delivery_slot, ''), '') || '.')::text,
            'orders'::text,
            o.id::text,
            0,
            o.created_at
        from public.orders o
        where o.requested_delivery_date is not null
          and o.status not in ('entregado','cancelado')
          and o.requested_delivery_date <= (now() at time zone 'America/Lima')::date
    )
    select a.alert_key, a.kind, a.severity, a.title, a.body, a.action_view, a.entity_id, a.minutes_waiting, a.created_at
    from alerts a
    order by
        case a.severity when 'urgent' then 0 when 'warning' then 1 else 2 end,
        a.created_at asc
    limit 100;
end;
$$;

revoke execute on function public.admin_operational_alerts() from anon;
grant execute on function public.admin_operational_alerts() to authenticated, service_role;
