# Mercado Pago: paso a producción

La integración de Kantu Floral usa Checkout Pro con preferencia creada desde la Edge Function `create-mp-preference` y confirmación del pago únicamente desde el webhook `mercadopago-webhook`.

## Variables de entorno

En Supabase Edge Functions deben existir:

- `MP_ACCESS_TOKEN`: Access Token de producción de la aplicación de Mercado Pago.
- `MP_WEBHOOK_SECRET`: clave secreta generada al configurar el webhook de producción.
- `MP_MODE=production`: activa el uso de `init_point` en lugar del checkout sandbox.
- `SITE_URL`: URL HTTPS pública del sitio.

Nunca colocar `MP_ACCESS_TOKEN` ni `MP_WEBHOOK_SECRET` en JavaScript del frontend o en GitHub.

## Mercado Pago Developers

En la misma aplicación usada para Checkout Pro:

1. Activar las credenciales de producción.
2. Configurar el sitio web público HTTPS.
3. En Webhooks, seleccionar el modo Producción.
4. Configurar la URL pública de `mercadopago-webhook`.
5. Activar el evento `Pagos`.
6. Guardar y copiar la clave secreta de producción a `MP_WEBHOOK_SECRET` en Supabase.

## Flujo esperado

1. El cliente crea un pedido pendiente.
2. `create-mp-preference` valida usuario, pedido e items en servidor.
3. En modo producción la función devuelve `init_point`; en modo test conserva `sandbox_init_point`.
4. El navegador redirige a Mercado Pago.
5. La URL de retorno solo informa al cliente; no aprueba pagos.
6. Mercado Pago envía el webhook firmado.
7. El webhook consulta el pago real en la API de Mercado Pago, valida referencia, moneda y monto.
8. Si el pago está aprobado, actualiza el pago y llama `confirm_paid_order` para confirmar el pedido y descontar stock de forma atómica.

## Checklist antes del primer cobro real

- `MP_MODE=production`.
- Access Token productivo configurado en Supabase.
- Webhook de producción configurado para el evento Pagos.
- `MP_WEBHOOK_SECRET` productivo configurado en Supabase.
- Sitio publicado por HTTPS.
- Hacer un primer pago real de monto pequeño y verificar en `orders`:
  - `payment_provider = mercadopago`
  - `payment_status = approved`
  - `payment_id` informado
  - `paid_at` informado
  - `status = confirmado`
  - stock descontado exactamente una vez.

Si el navegador vuelve con `?payment=success`, eso no debe considerarse prueba suficiente de pago. La autoridad sigue siendo el webhook validado contra la API de Mercado Pago.
