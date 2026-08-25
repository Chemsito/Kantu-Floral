update public.products p
set
    recommendation_audiences = case p.category
        when 'rosas' then array['pareja']::text[]
        when 'tulipanes' then array['pareja']::text[]
        when 'ramos_buchones' then array['pareja']::text[]
        when 'box' then array['pareja']::text[]
        when 'ramos' then array['mama','amiga']::text[]
        when 'flores' then array['mama','amiga']::text[]
        when 'canasta' then array['mama']::text[]
        when 'girasoles' then array['mama','amiga']::text[]
        else p.recommendation_audiences
    end,
    recommendation_occasions = case p.category
        when 'rosas' then array['aniversario','amor','primera_cita','perdon']::text[]
        when 'tulipanes' then array['aniversario','amor','primera_cita','perdon']::text[]
        when 'ramos_buchones' then array['aniversario','amor','primera_cita']::text[]
        when 'girasoles' then array['cumpleanos']::text[]
        when 'ramos' then array['cumpleanos','perdon']::text[]
        when 'box' then array['cumpleanos']::text[]
        when 'cajas' then array['cumpleanos']::text[]
        else p.recommendation_occasions
    end,
    recommendation_styles = case p.category
        when 'rosas' then array['romantico']::text[]
        when 'tulipanes' then array['romantico','elegante','tierno']::text[]
        when 'box' then array['elegante','impactante']::text[]
        when 'cajas' then array['elegante']::text[]
        when 'ramos_buchones' then array['impactante']::text[]
        when 'girasoles' then array['alegre']::text[]
        when 'ramos' then array['tierno']::text[]
        when 'flores' then array['tierno']::text[]
        else p.recommendation_styles
    end
where p.active
  and p.recommendation_priority = 0
  and cardinality(p.recommendation_audiences) = 0
  and cardinality(p.recommendation_occasions) = 0
  and cardinality(p.recommendation_styles) = 0
  and p.category in ('rosas','tulipanes','ramos_buchones','box','ramos','flores','canasta','girasoles','cajas');

alter function public.admin_operational_alerts() rename to admin_operational_alerts_base;
revoke all on function public.admin_operational_alerts_base() from public, anon, authenticated;

drop function if exists public.admin_operational_alerts();
create function public.admin_operational_alerts()
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
    with base_alerts as (
        select b.alert_key,b.kind,b.severity,b.title,b.body,b.action_view,b.entity_id,b.minutes_waiting,b.created_at
        from public.admin_operational_alerts_base() b
    ),
    extra_alerts as (
        select
            ('payment-attention:' || o.id::text)::text as alert_key,
            'payment_attention'::text as kind,
            'urgent'::text as severity,
            ('Pago aprobado requiere atención · pedido #' || o.id::text)::text as title,
            'El pago ya figura aprobado, pero el pedido sigue pendiente. Revisa la confirmación antes de preparar o entregar.'::text as body,
            'orders'::text as action_view,
            o.id::text as entity_id,
            floor(extract(epoch from (now() - coalesce(o.paid_at,o.created_at)))/60)::integer as minutes_waiting,
            coalesce(o.paid_at,o.created_at) as created_at
        from public.orders o
        where o.payment_status = 'approved' and o.status = 'pendiente'

        union all

        select
            'match-coverage'::text,
            'match_configuration'::text,
            'warning'::text,
            ('Kantu Match · ' || count(*)::text || ' productos necesitan configuración')::text,
            'Estos productos activos aún no tienen audiencia, ocasión, estilo ni prioridad. Completa sus señales comerciales para mejorar la precisión de Kantu Match.'::text,
            'products'::text,
            ''::text,
            0::integer,
            now() as created_at
        from public.products p
        where p.active
          and p.recommendation_priority = 0
          and cardinality(p.recommendation_audiences)=0
          and cardinality(p.recommendation_occasions)=0
          and cardinality(p.recommendation_styles)=0
        having count(*) > 0

        union all

        select
            ('payment-pending-reservation:' || o.id::text)::text,
            'payment_reservation'::text,
            'warning'::text,
            ('Pago pendiente mantiene stock reservado · pedido #' || o.id::text)::text,
            ('Mercado Pago mantiene una transacción pendiente y el stock continúa protegido. Lleva ' || floor(extract(epoch from (now()-min(r.reserved_at)))/60)::integer || ' min; revisa el estado si el cliente reporta un problema.')::text,
            'orders'::text,
            o.id::text,
            floor(extract(epoch from (now()-min(r.reserved_at)))/60)::integer,
            min(r.reserved_at) as created_at
        from public.orders o
        join private.order_stock_reservations r on r.order_id=o.id and r.state='active'
        where o.status='pendiente'
          and o.payment_status='pending'
          and o.payment_id is not null
          and r.reserved_at <= now()-interval '90 minutes'
        group by o.id
    ),
    combined as (
        select * from base_alerts
        union all
        select * from extra_alerts
    )
    select c.alert_key,c.kind,c.severity,c.title,c.body,c.action_view,c.entity_id,c.minutes_waiting,c.created_at
    from combined c
    order by case c.severity when 'urgent' then 0 when 'warning' then 1 else 2 end, c.created_at asc
    limit 100;
end;
$$;

revoke all on function public.admin_operational_alerts() from public, anon;
grant execute on function public.admin_operational_alerts() to authenticated;
