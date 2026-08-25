-- El número visible del Libro de Reclamaciones debe usar la fecha local de Perú.

alter table public.customer_claims
    alter column claim_number set default (
        'LR-' || to_char((now() at time zone 'America/Lima')::date, 'YYYYMMDD') || '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
    );
