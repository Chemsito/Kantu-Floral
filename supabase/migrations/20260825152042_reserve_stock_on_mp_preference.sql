create or replace function private.reserve_stock_on_mp_preference_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.payment_provider = 'mercadopago'
       and new.payment_preference_id is not null
       and (old.payment_preference_id is distinct from new.payment_preference_id
            or old.payment_provider is distinct from new.payment_provider)
       and new.status = 'pendiente'
       and new.payment_status in ('pending','rejected','cancelled')
    then
        perform public.reserve_order_stock_for_payment(new.id, 45);
    end if;
    return new;
end;
$$;

revoke all on function private.reserve_stock_on_mp_preference_assignment() from public, anon, authenticated;

drop trigger if exists orders_reserve_stock_on_mp_preference on public.orders;
create trigger orders_reserve_stock_on_mp_preference
after update of payment_provider, payment_preference_id on public.orders
for each row execute function private.reserve_stock_on_mp_preference_assignment();
