# Kantu Floral — Readable delivery address

## Goal

Keep the exact map coordinates used for delivery pricing while also storing a human-readable address for customers and operations.

## Stored format

New orders store the existing delivery address text column as:

`Dirección: <texto> | https://www.google.com/maps?q=<lat>,<lng> | Referencia: <opcional>`

This preserves backwards compatibility with historical orders that only contain a Maps URL or plain text.

## Checkout behavior

- Name, phone and saved profile address are reused when available.
- The customer must provide a readable address.
- The customer must still confirm the exact point on the map.
- Delivery pricing continues to use server-quoted latitude/longitude.
- The readable address never replaces the coordinate validation.

## Rendering

The shared `KantuCore.parseDeliveryAddress()` helper extracts:

- `addressLine`
- `mapsUrl`
- `reference`

Account, Admin and Staff use the shared renderer, so new orders show both the address and the Google Maps link.
