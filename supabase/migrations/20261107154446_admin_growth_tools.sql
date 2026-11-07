-- Kantu Floral · Herramientas de crecimiento del panel admin
-- 1) Metas de ventas mensuales
-- 2) Embudo de ventas (eventos anónimos de la tienda, sin datos personales)
-- 3) Ficha de clientes (CRM) solo para administradores
-- 4) Avisos por Telegram vía pg_net con credenciales cifradas en Vault
-- Todo accesible únicamente por RPC; las tablas niegan acceso directo.

create extension if not exists pg_net;

-- =====================================================
-- 1) METAS DE VENTAS
-- =====================================================
create table if not exists public.sales_goals (
    month date primary key,
    target numeric(12, 2) not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null,
    constraint sales_goals_month_first_day check (extract(day from month) = 1),
    constraint sales_goals_target_range check (target > 0 and target <= 10000000)
);

create index if not exists sales_goals_updated_by_idx on public.sales_goals (updated_by);
alter table public.sales_goals enable row level security;
revoke all on table public.sales_goals from public, anon, authenticated;
drop policy if exists "Deny client access to sales goals" on public.sales_goals;
create policy "Deny client access to sales goals" on public.sales_goals
    as restrictive for all to anon, authenticated using (false) with check (false);

create or replace function public.admin_set_sales_goal(p_month date, p_target numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_month date := date_trunc('month', coalesce(p_month, (now() at time zone 'America/Lima')::date))::date;
begin
    if not public.is_admin() then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;

    if p_target is null or p_target <= 0 then
        delete from public.sales_goals where month = v_month;
        return jsonb_build_object('month', v_month, 'target', null);
    end if;

    if p_target > 10000000 then
        raise exception 'GOAL_OUT_OF_RANGE' using errcode = '22003';
    end if;

    insert into public.sales_goals (month, target, updated_at, updated_by)
    values (v_month, round(p_target, 2), now(), auth.uid())
    on conflict (month) do update
        set target = excluded.target,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by;

    return jsonb_build_object('month', v_month, 'target', round(p_target, 2));
end;
$$;

revoke all on function public.admin_set_sales_goal(date, numeric) from public, anon;
grant execute on function public.admin_set_sales_goal(date, numeric) to authenticated;

-- =====================================================
-- 2) EMBUDO DE VENTAS
-- =====================================================
create table if not exists public.analytics_events (
    id bigint generated always as identity primary key,
    session_id uuid not null,
    event text not null,
    product_id bigint references public.products(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint analytics_events_event_check
        check (event in ('visit', 'product_view', 'add_to_cart', 'checkout_start'))
);

create index if not exists analytics_events_created_idx on public.analytics_events (created_at);
create index if not exists analytics_events_session_idx on public.analytics_events (session_id, created_at);
create index if not exists analytics_events_product_idx on public.analytics_events (product_id);

alter table public.analytics_events enable row level security;
revoke all on table public.analytics_events from public, anon, authenticated;
drop policy if exists "Deny client access to analytics events" on public.analytics_events;
create policy "Deny client access to analytics events" on public.analytics_events
    as restrictive for all to anon, authenticated using (false) with check (false);

-- Registro anónimo con validación, deduplicación y límites anti-abuso.
create or replace function public.track_storefront_event(
    p_session_id uuid,
    p_event text,
    p_product_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_product bigint := null;
begin
    if p_session_id is null or p_event not in ('visit', 'product_view', 'add_to_cart', 'checkout_start') then
        return;
    end if;

    -- Límite por sesión y límite global para proteger la cuota del plan gratuito.
    if (select count(*) from public.analytics_events e
        where e.session_id = p_session_id and e.created_at > now() - interval '1 minute') >= 30 then
        return;
    end if;
    if (select count(*) from public.analytics_events e
        where e.created_at > now() - interval '1 minute') >= 3000 then
        return;
    end if;

    if p_product_id is not null then
        select p.id into v_product from public.products p where p.id = p_product_id;
    end if;

    -- Visitas y checkouts se cuentan una vez por sesión cada 30 minutos.
    if p_event in ('visit', 'checkout_start') and exists (
        select 1 from public.analytics_events e
        where e.session_id = p_session_id
          and e.event = p_event
          and e.created_at > now() - interval '30 minutes'
    ) then
        return;
    end if;

    insert into public.analytics_events (session_id, event, product_id)
    values (p_session_id, p_event, v_product);
end;
$$;

revoke all on function public.track_storefront_event(uuid, text, bigint) from public;
grant execute on function public.track_storefront_event(uuid, text, bigint) to anon, authenticated;

-- Retención: 120 días de eventos para mantener la base liviana.
do $$
begin
    if exists (select 1 from cron.job where jobname = 'kantu-analytics-retention') then
        perform cron.unschedule('kantu-analytics-retention');
    end if;
    perform cron.schedule(
        'kantu-analytics-retention',
        '20 8 * * *',
        $job$delete from public.analytics_events where created_at < now() - interval '120 days'$job$
    );
end;
$$;

create or replace function private.next_annual_date(p_month smallint, p_day smallint, p_from date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_year int := extract(year from p_from)::int;
    v_candidate date;
begin
    if p_month is null or p_day is null or p_month not between 1 and 12 or p_day not between 1 and 31 then
        return null;
    end if;
    for i in 0..1 loop
        v_candidate := make_date(
            v_year + i,
            p_month,
            least(p_day::int, extract(day from (make_date(v_year + i, p_month, 1) + interval '1 month - 1 day'))::int)
        );
        if v_candidate >= p_from then
            return v_candidate;
        end if;
    end loop;
    return v_candidate;
end;
$$;

revoke all on function private.next_annual_date(smallint, smallint, date) from public, anon, authenticated;

-- =====================================================
-- 3) FICHA DE CLIENTES
-- =====================================================
create or replace function public.admin_customer_insights()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_today date := (now() at time zone 'America/Lima')::date;
    v_result jsonb;
begin
    if not public.is_admin() then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;

    with order_rows as (
        select
            o.*,
            case
                when o.user_id is not null then 'u:' || o.user_id::text
                else 't:' || regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g')
            end as customer_key,
            (o.payment_status = 'approved' and o.status <> 'cancelado') as paid
        from public.orders o
        where o.user_id is not null or nullif(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), '') is not null
    ),
    per_customer as (
        select
            customer_key,
            max(user_id::text)::uuid as user_id,
            (array_agg(customer_name order by created_at desc))[1] as last_name,
            (array_agg(customer_phone order by created_at desc))[1] as last_phone,
            count(*) filter (where paid) as paid_orders,
            count(*) as all_orders,
            coalesce(sum(total) filter (where paid), 0) as total_spent,
            max(created_at) filter (where paid) as last_paid_at,
            min(created_at) filter (where paid) as first_paid_at,
            max(created_at) as last_order_at
        from order_rows
        group by customer_key
    ),
    favorite_category as (
        select distinct on (r.customer_key)
            r.customer_key, p.category
        from order_rows r
        join public.order_items oi on oi.order_id = r.id
        join public.products p on p.id = oi.product_id
        where r.paid
        group by r.customer_key, p.category
        order by r.customer_key, sum(oi.quantity) desc, p.category
    ),
    registered_without_orders as (
        select 'u:' || pr.id::text as customer_key, pr.id as user_id, pr.full_name, pr.phone, pr.created_at
        from public.profiles pr
        where pr.role = 'customer'
          and not exists (select 1 from per_customer pc where pc.customer_key = 'u:' || pr.id::text)
    ),
    reminders as (
        select r.user_id, r.label, r.occasion_type,
               private.next_annual_date(r.month, r.day, v_today) as next_date
        from public.occasion_reminders r
        where r.enabled
    ),
    customers as (
        select
            pc.customer_key,
            pc.user_id,
            coalesce(nullif(pr.full_name, ''), pc.last_name, 'Cliente') as name,
            coalesce(nullif(pc.last_phone, ''), pr.phone) as phone,
            pr.email,
            pc.paid_orders,
            pc.all_orders,
            pc.total_spent,
            case when pc.paid_orders > 0 then round(pc.total_spent / pc.paid_orders, 2) else 0 end as avg_ticket,
            pc.first_paid_at,
            pc.last_paid_at,
            pc.last_order_at,
            fc.category as favorite_category,
            case
                when pc.paid_orders = 0 then 'interesado'
                when pc.last_paid_at < now() - interval '90 days' then 'en_riesgo'
                when pc.paid_orders >= 3 or pc.total_spent >= 600 then 'vip'
                when pc.paid_orders >= 2 then 'recurrente'
                else 'nuevo'
            end as segment,
            (select min(rm.next_date) from reminders rm where rm.user_id = pc.user_id) as next_occasion
        from per_customer pc
        left join public.profiles pr on pr.id = pc.user_id
        left join favorite_category fc on fc.customer_key = pc.customer_key
        union all
        select
            rw.customer_key, rw.user_id, coalesce(nullif(rw.full_name, ''), 'Cliente registrado'), rw.phone,
            (select p2.email from public.profiles p2 where p2.id = rw.user_id),
            0, 0, 0, 0, null, null, null, null, 'sin_compras',
            (select min(rm.next_date) from reminders rm where rm.user_id = rw.user_id)
        from registered_without_orders rw
    )
    select jsonb_build_object(
        'generated_at', now(),
        'summary', jsonb_build_object(
            'total', (select count(*) from customers),
            'vip', (select count(*) from customers where segment = 'vip'),
            'recurrente', (select count(*) from customers where segment = 'recurrente'),
            'nuevo', (select count(*) from customers where segment = 'nuevo'),
            'en_riesgo', (select count(*) from customers where segment = 'en_riesgo'),
            'interesado', (select count(*) from customers where segment = 'interesado'),
            'sin_compras', (select count(*) from customers where segment = 'sin_compras'),
            'lifetime_value', (select coalesce(round(avg(total_spent) filter (where paid_orders > 0), 2), 0) from customers),
            'repeat_rate', (
                select case when count(*) filter (where paid_orders > 0) = 0 then 0
                    else round(100.0 * count(*) filter (where paid_orders >= 2) / count(*) filter (where paid_orders > 0), 1) end
                from customers
            )
        ),
        'customers', (
            select coalesce(jsonb_agg(to_jsonb(c) - 'customer_key' || jsonb_build_object('key', md5(c.customer_key))
                order by c.total_spent desc, c.last_order_at desc nulls last), '[]'::jsonb)
            from (select * from customers limit 1000) c
        ),
        'upcoming', (
            select coalesce(jsonb_agg(u order by u.next_date), '[]'::jsonb)
            from (
                select rm.next_date, rm.label, rm.occasion_type,
                       coalesce(nullif(pr.full_name, ''), 'Cliente') as customer_name,
                       pr.phone
                from reminders rm
                left join public.profiles pr on pr.id = rm.user_id
                where rm.next_date between v_today and v_today + 45
                order by rm.next_date
                limit 50
            ) u
        )
    )
    into v_result;

    return v_result;
end;
$$;

revoke all on function public.admin_customer_insights() from public, anon;
grant execute on function public.admin_customer_insights() to authenticated;

-- =====================================================
-- 4) AVISOS POR TELEGRAM
-- =====================================================
create table if not exists public.notification_settings (
    id smallint primary key default 1,
    telegram_enabled boolean not null default true,
    notify_new_order boolean not null default true,
    notify_payment_approved boolean not null default true,
    notify_payment_proof boolean not null default true,
    notify_delivered boolean not null default false,
    notify_cancelled boolean not null default true,
    notify_claims boolean not null default true,
    updated_at timestamptz not null default now(),
    constraint notification_settings_singleton check (id = 1)
);

insert into public.notification_settings (id) values (1) on conflict (id) do nothing;

alter table public.notification_settings enable row level security;
revoke all on table public.notification_settings from public, anon, authenticated;
drop policy if exists "Deny client access to notification settings" on public.notification_settings;
create policy "Deny client access to notification settings" on public.notification_settings
    as restrictive for all to anon, authenticated using (false) with check (false);

create schema if not exists private;

create or replace function private.telegram_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select ds.decrypted_secret
    from vault.decrypted_secrets ds
    where ds.name = p_name
    order by ds.updated_at desc nulls last
    limit 1;
$$;

revoke all on function private.telegram_secret(text) from public, anon, authenticated;

create or replace function private.telegram_escape(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
    select replace(replace(replace(coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

-- Envía un mensaje si Telegram está configurado. Nunca interrumpe la transacción.
create or replace function private.telegram_send(p_text text, p_force boolean default false)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_token text;
    v_chat text;
    v_enabled boolean;
    v_request bigint;
begin
    select telegram_enabled into v_enabled from public.notification_settings where id = 1;
    if not coalesce(v_enabled, false) and not p_force then
        return null;
    end if;

    v_token := private.telegram_secret('kantu_telegram_bot_token');
    v_chat := private.telegram_secret('kantu_telegram_chat_id');
    if v_token is null or v_chat is null then
        return null;
    end if;

    select net.http_post(
        url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        body := jsonb_build_object(
            'chat_id', v_chat,
            'text', left(p_text, 3900),
            'parse_mode', 'HTML',
            'disable_web_page_preview', true
        ),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 5000
    ) into v_request;

    return v_request;
exception when others then
    return null;
end;
$$;

revoke all on function private.telegram_send(text, boolean) from public, anon, authenticated;

create or replace function private.notify_order_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    s public.notification_settings%rowtype;
    v_who text := private.telegram_escape(coalesce(nullif(new.customer_name, ''), 'Cliente'));
    v_total text := 'S/ ' || to_char(coalesce(new.total, 0), 'FM999G999G990D00');
    v_method text := case new.payment_provider
        when 'mercadopago' then 'Mercado Pago'
        when 'yape' then 'Yape / Plin'
        when 'transferencia' then 'Transferencia'
        else coalesce(new.payment_provider, 'sin definir') end;
    v_when text := case when new.requested_delivery_date is not null
        then E'\n📅 Entrega: ' || to_char(new.requested_delivery_date, 'DD/MM') || coalesce(' · ' || new.requested_delivery_slot, '')
        else E'\n⚡ Entrega: lo antes posible' end;
begin
    select * into s from public.notification_settings where id = 1;
    if not found then
        return new;
    end if;

    if tg_op = 'INSERT' then
        if s.notify_new_order then
            perform private.telegram_send(
                '🛍️ <b>Nuevo pedido #' || new.id || '</b>' || E'\n' ||
                v_who || ' · ' || v_total || v_when || E'\n' ||
                'Estado: pendiente de pago'
            );
        end if;
        return new;
    end if;

    if s.notify_payment_approved
       and new.payment_status = 'approved'
       and old.payment_status is distinct from 'approved' then
        perform private.telegram_send(
            '✅ <b>Pago aprobado · Pedido #' || new.id || '</b>' || E'\n' ||
            v_who || ' · ' || v_total || ' · ' || private.telegram_escape(v_method) || v_when || E'\n' ||
            'Listo para preparar en Operaciones.'
        );
    end if;

    if new.status is distinct from old.status then
        if new.status = 'cancelado' and s.notify_cancelled then
            perform private.telegram_send('❌ <b>Pedido #' || new.id || ' cancelado</b>' || E'\n' || v_who || ' · ' || v_total);
        elsif new.status = 'entregado' and s.notify_delivered then
            perform private.telegram_send('🎉 <b>Pedido #' || new.id || ' entregado</b>' || E'\n' || v_who || ' · ' || v_total);
        end if;
    end if;

    return new;
exception when others then
    return new;
end;
$$;

revoke all on function private.notify_order_events() from public, anon, authenticated;

drop trigger if exists kantu_notify_order_insert on public.orders;
create trigger kantu_notify_order_insert
    after insert on public.orders
    for each row execute function private.notify_order_events();

drop trigger if exists kantu_notify_order_update on public.orders;
create trigger kantu_notify_order_update
    after update of status, payment_status on public.orders
    for each row execute function private.notify_order_events();

create or replace function private.notify_payment_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_enabled boolean;
begin
    select notify_payment_proof into v_enabled from public.notification_settings where id = 1;
    if coalesce(v_enabled, false) then
        perform private.telegram_send(
            '🧾 <b>Comprobante recibido · Pedido #' || new.order_id || '</b>' || E'\n' ||
            'S/ ' || to_char(coalesce(new.amount, 0), 'FM999G999G990D00') || ' · ' ||
            case new.payment_method when 'yape' then 'Yape / Plin' else 'Transferencia' end ||
            coalesce(' · Op. ' || private.telegram_escape(new.operation_number), '') || E'\n' ||
            'Revísalo en Admin → Pagos por verificar.'
        );
    end if;
    return new;
exception when others then
    return new;
end;
$$;

revoke all on function private.notify_payment_proof() from public, anon, authenticated;

drop trigger if exists kantu_notify_payment_proof on public.payment_proofs;
create trigger kantu_notify_payment_proof
    after insert on public.payment_proofs
    for each row execute function private.notify_payment_proof();

create or replace function private.notify_customer_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_enabled boolean;
begin
    select notify_claims into v_enabled from public.notification_settings where id = 1;
    if coalesce(v_enabled, false) then
        perform private.telegram_send(
            '⚠️ <b>Nuevo reclamo ' || private.telegram_escape(coalesce(new.claim_number, '#' || new.id)) || '</b>' || E'\n' ||
            private.telegram_escape(coalesce(new.complaint_type, 'reclamo')) || ' · ' ||
            private.telegram_escape(coalesce(new.full_name, 'Cliente')) || E'\n' ||
            'Revísalo en Admin → Reclamos.'
        );
    end if;
    return new;
exception when others then
    return new;
end;
$$;

revoke all on function private.notify_customer_claim() from public, anon, authenticated;

drop trigger if exists kantu_notify_customer_claim on public.customer_claims;
create trigger kantu_notify_customer_claim
    after insert on public.customer_claims
    for each row execute function private.notify_customer_claim();

-- RPC de administración (el token nunca se devuelve al navegador)
create or replace function public.admin_telegram_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    s public.notification_settings%rowtype;
begin
    if not public.is_admin() then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;
    select * into s from public.notification_settings where id = 1;
    return jsonb_build_object(
        'token_configured', private.telegram_secret('kantu_telegram_bot_token') is not null,
        'chat_configured', private.telegram_secret('kantu_telegram_chat_id') is not null,
        'chat_hint', right(coalesce(private.telegram_secret('kantu_telegram_chat_id'), ''), 4),
        'settings', to_jsonb(s) - 'id'
    );
end;
$$;

create or replace function public.admin_set_telegram_credentials(p_token text default null, p_chat_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_token text := nullif(btrim(coalesce(p_token, '')), '');
    v_chat text := nullif(btrim(coalesce(p_chat_id, '')), '');
    v_id uuid;
begin
    if not public.is_admin() then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;

    if v_token is not null then
        if v_token !~ '^[0-9]{5,15}:[A-Za-z0-9_-]{30,60}$' then
            raise exception 'TELEGRAM_TOKEN_INVALID' using errcode = '22023';
        end if;
        select id into v_id from vault.secrets where name = 'kantu_telegram_bot_token';
        if v_id is null then
            perform vault.create_secret(v_token, 'kantu_telegram_bot_token', 'Kantu Floral · token del bot de Telegram');
        else
            perform vault.update_secret(v_id, v_token);
        end if;
    end if;

    if v_chat is not null then
        if v_chat !~ '^-?[0-9]{3,20}$' then
            raise exception 'TELEGRAM_CHAT_INVALID' using errcode = '22023';
        end if;
        select id into v_id from vault.secrets where name = 'kantu_telegram_chat_id';
        if v_id is null then
            perform vault.create_secret(v_chat, 'kantu_telegram_chat_id', 'Kantu Floral · chat de avisos de Telegram');
        else
            perform vault.update_secret(v_id, v_chat);
        end if;
    end if;

    return public.admin_telegram_status();
end;
$$;

create or replace function public.admin_set_notification_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;

    update public.notification_settings set
        telegram_enabled = coalesce((p_settings ->> 'telegram_enabled')::boolean, telegram_enabled),
        notify_new_order = coalesce((p_settings ->> 'notify_new_order')::boolean, notify_new_order),
        notify_payment_approved = coalesce((p_settings ->> 'notify_payment_approved')::boolean, notify_payment_approved),
        notify_payment_proof = coalesce((p_settings ->> 'notify_payment_proof')::boolean, notify_payment_proof),
        notify_delivered = coalesce((p_settings ->> 'notify_delivered')::boolean, notify_delivered),
        notify_cancelled = coalesce((p_settings ->> 'notify_cancelled')::boolean, notify_cancelled),
        notify_claims = coalesce((p_settings ->> 'notify_claims')::boolean, notify_claims),
        updated_at = now()
    where id = 1;

    return public.admin_telegram_status();
end;
$$;

-- Envía un mensaje de prueba y devuelve el id de la solicitud HTTP.
create or replace function public.admin_send_telegram_test()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;
    return private.telegram_send(
        '🌸 <b>Kantu Floral</b>' || E'\n' || '¡Listo! Aquí recibirás los avisos de pedidos, pagos y reclamos.',
        true
    );
end;
$$;

-- Pide a Telegram los últimos mensajes recibidos por el bot (para detectar el chat).
create or replace function public.admin_telegram_request_updates()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_token text;
begin
    if not public.is_admin() then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;
    v_token := private.telegram_secret('kantu_telegram_bot_token');
    if v_token is null then
        raise exception 'TELEGRAM_TOKEN_MISSING' using errcode = '22023';
    end if;
    return net.http_get(
        url := 'https://api.telegram.org/bot' || v_token || '/getUpdates?limit=20',
        timeout_milliseconds := 5000
    );
end;
$$;

-- Lee la respuesta de una solicitud anterior. Solo devuelve datos útiles, nunca el token.
create or replace function public.admin_telegram_read_response(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    r record;
    v_body jsonb;
    v_chats jsonb;
begin
    if not public.is_admin() then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;

    select status_code, content, error_msg into r from net._http_response where id = p_request_id;
    if not found then
        return jsonb_build_object('ready', false);
    end if;

    begin
        v_body := r.content::jsonb;
    exception when others then
        v_body := null;
    end;

    select coalesce(jsonb_agg(distinct jsonb_build_object(
        'id', (u -> 'message' -> 'chat' ->> 'id'),
        'title', coalesce(u -> 'message' -> 'chat' ->> 'title',
                          trim(coalesce(u -> 'message' -> 'chat' ->> 'first_name', '') || ' ' || coalesce(u -> 'message' -> 'chat' ->> 'last_name', ''))),
        'type', u -> 'message' -> 'chat' ->> 'type'
    )), '[]'::jsonb)
    into v_chats
    from jsonb_array_elements(case when jsonb_typeof(v_body -> 'result') = 'array' then v_body -> 'result' else '[]'::jsonb end) u
    where u -> 'message' -> 'chat' ->> 'id' is not null;

    return jsonb_build_object(
        'ready', true,
        'ok', coalesce((v_body ->> 'ok')::boolean, false),
        'status_code', r.status_code,
        'description', coalesce(v_body ->> 'description', r.error_msg),
        'chats', v_chats
    );
end;
$$;

revoke all on function public.admin_telegram_status() from public, anon;
revoke all on function public.admin_set_telegram_credentials(text, text) from public, anon;
revoke all on function public.admin_set_notification_settings(jsonb) from public, anon;
revoke all on function public.admin_send_telegram_test() from public, anon;
revoke all on function public.admin_telegram_request_updates() from public, anon;
revoke all on function public.admin_telegram_read_response(bigint) from public, anon;
grant execute on function public.admin_telegram_status() to authenticated;
grant execute on function public.admin_set_telegram_credentials(text, text) to authenticated;
grant execute on function public.admin_set_notification_settings(jsonb) to authenticated;
grant execute on function public.admin_send_telegram_test() to authenticated;
grant execute on function public.admin_telegram_request_updates() to authenticated;
grant execute on function public.admin_telegram_read_response(bigint) to authenticated;

-- =====================================================
-- 5) DASHBOARD: meta mensual y embudo de ventas
-- =====================================================
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
    v_month_start date;
    v_month_days int;
    v_month_elapsed int;
    v_goal numeric;
    v_month_revenue numeric;
    v_extras jsonb;
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

    -- Meta mensual (mes calendario de Lima).
    v_month_start := date_trunc('month', v_today)::date;
    v_month_days := extract(day from (v_month_start + interval '1 month - 1 day'))::int;
    v_month_elapsed := (v_today - v_month_start) + 1;
    select g.target into v_goal from public.sales_goals g where g.month = v_month_start;
    select coalesce(sum(o.total), 0) into v_month_revenue
    from public.orders o
    where o.payment_status = 'approved'
      and o.status <> 'cancelado'
      and o.created_at >= (v_month_start::timestamp at time zone v_tz);

    -- Embudo: sesiones anónimas de la tienda + pedidos reales del periodo.
    select jsonb_build_object(
        'goal', jsonb_build_object(
            'month', v_month_start,
            'target', v_goal,
            'achieved', v_month_revenue,
            'days_in_month', v_month_days,
            'days_elapsed', v_month_elapsed,
            'projection', round(v_month_revenue / greatest(v_month_elapsed, 1) * v_month_days, 2),
            'needed_per_day', case when v_goal is null then null
                else round(greatest(v_goal - v_month_revenue, 0) / greatest(v_month_days - v_month_elapsed + 1, 1), 2) end
        ),
        'funnel', jsonb_build_object(
            'visits', (select count(distinct e.session_id) from public.analytics_events e
                       where e.event = 'visit' and e.created_at >= (v_start::timestamp at time zone v_tz)),
            'product_views', (select count(distinct e.session_id) from public.analytics_events e
                       where e.event = 'product_view' and e.created_at >= (v_start::timestamp at time zone v_tz)),
            'add_to_cart', (select count(distinct e.session_id) from public.analytics_events e
                       where e.event = 'add_to_cart' and e.created_at >= (v_start::timestamp at time zone v_tz)),
            'checkout_start', (select count(distinct e.session_id) from public.analytics_events e
                       where e.event = 'checkout_start' and e.created_at >= (v_start::timestamp at time zone v_tz)),
            'orders', (select count(*) from public.orders o
                       where o.created_at >= (v_start::timestamp at time zone v_tz)),
            'paid', (select count(*) from public.orders o
                       where o.payment_status = 'approved' and o.status <> 'cancelado'
                         and o.created_at >= (v_start::timestamp at time zone v_tz)),
            'tracking_since', (select min(e.created_at) from public.analytics_events e)
        ),
        'top_viewed', (
            select coalesce(jsonb_agg(t order by t.views desc), '[]'::jsonb)
            from (
                select p.id, p.name, count(*) as views,
                       count(*) filter (where e.event = 'add_to_cart') as adds
                from public.analytics_events e
                join public.products p on p.id = e.product_id
                where e.event in ('product_view', 'add_to_cart')
                  and e.created_at >= (v_start::timestamp at time zone v_tz)
                group by p.id, p.name
                order by count(*) desc
                limit 5
            ) t
        )
    ) into v_extras;

    return v_result || v_extras;
end;
$$;


revoke all on function public.admin_dashboard_analytics(integer) from public, anon;
grant execute on function public.admin_dashboard_analytics(integer) to authenticated;
