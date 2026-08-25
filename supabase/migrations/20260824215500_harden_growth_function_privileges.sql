-- Kantu Floral: mínimo privilegio para funciones de crecimiento.

revoke execute on function public.admin_operational_alerts() from anon;
grant execute on function public.admin_operational_alerts() to authenticated, service_role;

-- El feed de cliente sí es intencionalmente público para visitantes y clientes.
grant execute on function public.get_customer_notification_feed() to anon, authenticated, service_role;

-- Alta de reclamos permanece exclusivamente detrás de la Edge Function/service_role.
revoke all on function public.service_submit_customer_claim(jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.service_submit_customer_claim(jsonb,text,uuid) to service_role;
