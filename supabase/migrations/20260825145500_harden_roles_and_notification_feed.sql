-- Kantu Floral: hardening de roles, personalizaciones y feed de notificaciones.

-- 1) Un cliente autenticado solo puede editar columnas de perfil no privilegiadas.
revoke update on table public.profiles from authenticated;
grant update (full_name, phone, address, district, city, avatar_url)
  on table public.profiles to authenticated;

-- Defensa adicional: aun si en el futuro se amplían grants por accidente,
-- un usuario no-admin no puede cambiar roles desde una sesión autenticada.
create or replace function private.guard_profile_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'PROFILE_ROLE_CHANGE_FORBIDDEN';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_profile_role_change() from public, anon, authenticated;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
before update of role on public.profiles
for each row execute function private.guard_profile_role_change();

-- 2) El rol operativo oficial es `florist`, no `florista`.
create or replace function public.get_order_item_customizations(p_order_id bigint)
returns table(product_id bigint, product_name text, customization text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_owner uuid;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_order_id is null then raise exception 'ORDER_ID_REQUIRED'; end if;

  select o.user_id into v_owner
  from public.orders o
  where o.id = p_order_id;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_owner is distinct from v_user_id
     and coalesce(v_role, '') not in ('admin', 'florist', 'delivery') then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  return query
  select oi.product_id,
         coalesce(pr.name, 'Producto')::text,
         oi.customization
  from public.order_items oi
  left join public.products pr on pr.id = oi.product_id
  where oi.order_id = p_order_id
    and oi.customization is not null
  order by oi.id;
end;
$$;

revoke all on function public.get_order_item_customizations(bigint) from public, anon;
grant execute on function public.get_order_item_customizations(bigint) to authenticated, service_role;

-- 3) El feed público deja de ejecutar una función SECURITY DEFINER expuesta.
-- Los helpers privilegiados viven en `private`, que no forma parte del Data API.
grant usage on schema private to anon, authenticated;

create or replace function private.get_public_promotion_notification_feed()
returns table(notification_key text, kind text, title text, body text, severity text, action_url text, created_at timestamptz)
language sql
stable
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
        or (
          select count(*)
          from public.orders o
          where o.promotion_id = p.id
            and o.status <> 'cancelado'
        ) < p.max_redemptions
      )
    order by coalesce(p.ends_at, now() + interval '10 years'), p.id desc
    limit 8
  )
  select
    'promo:' || p.id::text,
    'promotion'::text,
    ('Código ' || p.code || ' disponible')::text,
    coalesce(
      nullif(p.description, ''),
      case
        when p.discount_type = 'percent' then trim(to_char(p.discount_value, 'FM999999990.##')) || '% de descuento'
        else 'S/ ' || trim(to_char(p.discount_value, 'FM999999990.00')) || ' de descuento'
      end
    )::text,
    'benefit'::text,
    '#catalogo'::text,
    p.created_at
  from valid_promotions p;
$$;

create or replace function private.get_customer_order_notification_feed()
returns table(notification_key text, kind text, title text, body text, severity text, action_url text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
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
    ('Pedido #' || o.id::text || ' · ' || case o.status
      when 'pendiente' then 'pendiente'
      when 'confirmado' then 'confirmado'
      when 'preparando' then 'en preparación'
      when 'en_camino' then 'en camino'
      when 'entregado' then 'entregado'
      else o.status end)::text,
    case when o.payment_status = 'rejected' then 'warning' else 'order' end::text,
    '#inicio'::text,
    coalesce(o.paid_at, o.created_at)
  from public.orders o
  where auth.uid() is not null
    and o.user_id = auth.uid()
    and o.created_at >= now() - interval '30 days'
    and o.status <> 'cancelado'
  order by o.created_at desc
  limit 5;
$$;

create or replace function private.get_customer_reminder_notification_feed()
returns table(notification_key text, kind text, title text, body text, severity text, action_url text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    'occasion:' || r.id::text || ':' || r.next_occurrence::text,
    'occasion'::text,
    ('Se acerca: ' || r.label)::text,
    case
      when r.days_until = 0 then 'Es hoy. Si quieres regalar flores, aún estás a tiempo.'
      when r.days_until = 1 then 'Es mañana. Puedes elegir y programar el regalo desde Kantu.'
      else ('Faltan ' || r.days_until::text || ' días. Puedes preparar el regalo con anticipación.')
    end::text,
    'reminder'::text,
    '#catalogo'::text,
    now()
  from public.get_my_occasion_reminders() r
  where auth.uid() is not null
    and r.enabled
    and r.is_due
  order by r.days_until asc, r.id
  limit 5;
$$;

revoke all on function private.get_public_promotion_notification_feed() from public;
revoke all on function private.get_customer_order_notification_feed() from public;
revoke all on function private.get_customer_reminder_notification_feed() from public;
grant execute on function private.get_public_promotion_notification_feed() to anon, authenticated, service_role;
grant execute on function private.get_customer_order_notification_feed() to anon, authenticated, service_role;
grant execute on function private.get_customer_reminder_notification_feed() to anon, authenticated, service_role;

create or replace function public.get_customer_notification_feed()
returns table(notification_key text, kind text, title text, body text, severity text, action_url text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with feed as (
    select * from private.get_public_promotion_notification_feed()
    union all
    select
      'trend:' || p.id::text,
      'trend'::text,
      'Destacado por Kantu'::text,
      (p.name || ' está disponible por S/ ' || trim(to_char(p.price, 'FM999999990.00')))::text,
      'info'::text,
      ('producto.html?id=' || p.id::text)::text,
      coalesce(p.created_at, now())
    from public.products p
    where p.active and p.featured and p.stock > 0
    order by created_at desc
    limit 10
  ), personal as (
    select * from private.get_customer_order_notification_feed()
    union all
    select * from private.get_customer_reminder_notification_feed()
  )
  select f.notification_key, f.kind, f.title, f.body, f.severity, f.action_url, f.created_at
  from (
    select * from feed
    union all
    select * from personal
  ) f
  order by f.created_at desc
  limit 25;
$$;

revoke all on function public.get_customer_notification_feed() from public;
grant execute on function public.get_customer_notification_feed() to anon, authenticated, service_role;
