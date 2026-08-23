-- Los pedidos y sus líneas se escriben únicamente mediante RPCs validados.
-- El navegador solo necesita lectura autenticada.

revoke all privileges on table public.orders from anon;
revoke insert, update, delete, truncate, references, trigger on table public.orders from authenticated;
grant select on table public.orders to authenticated;

revoke all privileges on table public.order_items from anon;
revoke insert, update, delete, truncate, references, trigger on table public.order_items from authenticated;
grant select on table public.order_items to authenticated;
