alter table public.orders
    add column if not exists payment_status_detail text;

alter table public.orders
    drop constraint if exists orders_payment_status_detail_length;

alter table public.orders
    add constraint orders_payment_status_detail_length
    check (
        payment_status_detail is null
        or char_length(payment_status_detail) <= 255
    );

comment on column public.orders.payment_status_detail is
    'Detalle técnico del estado devuelto por el proveedor de pago, por ejemplo Mercado Pago status_detail.';
