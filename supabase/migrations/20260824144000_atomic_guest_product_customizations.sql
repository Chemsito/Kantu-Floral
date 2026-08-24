-- Checkout invitado: crear pedido y registrar personalizaciones en una sola transacción.
create or replace function public.create_guest_order_customized(
  p_access_token_hash text,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_lat numeric,
  p_delivery_lng numeric,
  p_recipient_name text,
  p_recipient_phone text,
  p_gift_message text,
  p_is_surprise boolean,
  p_requested_delivery_date date,
  p_requested_delivery_slot text,
  p_customizations jsonb
)
returns table(
  order_id bigint,
  total numeric,
  subtotal numeric,
  delivery_fee numeric,
  delivery_distance_km numeric,
  estimated_delivery_minutes integer,
  discount_amount numeric,
  access_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  if p_customizations is null then p_customizations := '{}'::jsonb; end if;
  if jsonb_typeof(p_customizations) <> 'object' then
    raise exception 'INVALID_PRODUCT_CUSTOMIZATIONS';
  end if;

  select * into v_order
  from public.create_guest_order(
    p_access_token_hash,
    p_items,
    p_customer_name,
    p_customer_phone,
    p_delivery_address,
    p_delivery_lat,
    p_delivery_lng,
    p_recipient_name,
    p_recipient_phone,
    p_gift_message,
    p_is_surprise,
    p_requested_delivery_date,
    p_requested_delivery_slot
  );

  perform public.service_set_guest_order_customizations(v_order.order_id, p_customizations);

  return query select
    v_order.order_id::bigint,
    v_order.total::numeric,
    v_order.subtotal::numeric,
    v_order.delivery_fee::numeric,
    v_order.delivery_distance_km::numeric,
    v_order.estimated_delivery_minutes::integer,
    v_order.discount_amount::numeric,
    v_order.access_expires_at::timestamptz;
end;
$$;

revoke all on function public.create_guest_order_customized(text,jsonb,text,text,text,numeric,numeric,text,text,text,boolean,date,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_guest_order_customized(text,jsonb,text,text,text,numeric,numeric,text,text,text,boolean,date,text,jsonb)
  to service_role;
