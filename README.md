# Kantu Floral

Sitio web de Kantu Floral con catálogo, carrito, autenticación, pedidos, pagos y paneles operativos conectados a Supabase.

## Desarrollo

Requisitos:

- Node.js 20+
- npm
- Deno 2.x para comprobar las Edge Functions

Instala dependencias:

```bash
npm ci
```

Ejecuta las comprobaciones del repositorio:

```bash
npm run check
```

`npm run check` valida sintaxis JavaScript, contratos de hardening y contratos de seguridad/RLS documentados en las migraciones.

Para validar también las Edge Functions como lo hace GitHub Actions:

```bash
deno check --no-config \
  supabase/functions/create-mp-preference/index.ts \
  supabase/functions/mercadopago-webhook/index.ts
```

## Seguridad y pagos

- El navegador usa únicamente la publishable key de Supabase.
- Las operaciones privilegiadas pasan por RLS/RPC o Edge Functions con validación del usuario/rol.
- La confirmación de Mercado Pago solo puede ejecutar `confirm_paid_order` mediante `service_role`.
- Los comprobantes manuales se guardan en un bucket privado y se validan mediante políticas de Storage/RLS.
- Los totales de Mercado Pago se reconstruyen desde los precios históricos del pedido más el delivery antes de abrir Checkout Pro.
- Justo antes de crear la preferencia de Mercado Pago se vuelve a validar que los productos sigan activos y exista stock suficiente.
- Un pago rechazado o cancelado puede reintentarse con Mercado Pago; un pago ya aprobado no puede reemplazarse por otro `payment_id`.

## Migraciones

Los archivos de `supabase/migrations` deben conservar exactamente las versiones registradas en el historial remoto de Supabase. No renombres migraciones ya aplicadas ni agregues migraciones antiguas fuera de historial; crea siempre una migración nueva.

## Flujo de estados

- Pedido recién creado: `pendiente` + pago `pending`.
- Mercado Pago o aprobación manual confirma el pago y el pedido.
- Preparación, reparto y entrega se actualizan desde el portal de staff.
- El panel Admin no debe saltarse el flujo operativo ni cancelar pedidos pagados sin gestionar previamente el reembolso.
