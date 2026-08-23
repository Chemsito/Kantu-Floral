-- Import snapshot from Florever Peru catalog supplied by the user.
-- Names, current prices, source image URLs and badges come from the uploaded HTML snapshot.
with catalog(idx,name,price,category,image,tag,size) as (
  values
  (1, 'CAJA LARGA 3 GIRASOLES', 69.00, 'girasoles', 'https://floreverperu.com/media/productos/variantes/CAJA_LARGA_3_GIRASOLES_-_S2.webp', 'Express · Oferta', 'S'),
  (2, 'RAMO MEREDITH', 169.00, 'ramos', 'https://floreverperu.com/media/productos/variantes/SV_-_RAMO_MEREDITH_-S1.webp', null, 'M'),
  (3, 'Canasta Rouge', 309.00, 'canasta', 'https://floreverperu.com/media/productos/variantes/IMG_1809.webp', 'Destacado · Oferta', 'XL'),
  (4, 'CANASTA 100 ROSAS', 519.00, 'canasta', 'https://floreverperu.com/media/productos/variantes/SV-CANASTA-100-S2.webp', 'Destacado · Oferta', 'XXL'),
  (5, 'SUNRISE BOX', 229.00, 'box', 'https://floreverperu.com/media/productos/variantes/WhatsApp_Image_2026-04-27_at_3.20.30_PM_1.webp', 'Destacado · Oferta', 'L'),
  (6, 'CAJA LARGA 6 ROSAS', 89.00, 'rosas', 'https://floreverperu.com/media/productos/variantes/CAJA-LARGA-6-ROSAS-S1.webp', null, 'M'),
  (7, 'ESTANDAR BOX BLANCO', 169.00, 'box', 'https://floreverperu.com/media/productos/variantes/ESTANDAR-BOX-S1.webp', null, 'M'),
  (8, 'BLOOM BOX', 159.00, 'box', 'https://floreverperu.com/media/productos/variantes/IMG_6833.webp', null, 'M'),
  (9, 'FLORERO FLEUR ROSÉ LUXE', 229.00, 'flores', 'https://floreverperu.com/media/productos/variantes/Captura_de_pantalla_2026-05-05_220849.webp', 'Destacado · Oferta', 'L'),
  (10, 'GARDEN SUNSHINE BOX', 329.00, 'box', 'https://floreverperu.com/media/productos/variantes/IMG_1711.webp', 'Destacado', 'XL'),
  (11, 'RAMO ISABELLA', 139.00, 'ramos', 'https://floreverperu.com/media/productos/variantes/SV_-_RAMO_RAFAELLA_-_S1_tambi%C3%A9n_va_en_el_cat%C3%A1logo_normal.webp', 'Destacado · Oferta', 'M'),
  (12, 'MEDIUM FERRERO BOX', 239.00, 'box', 'https://floreverperu.com/media/productos/variantes/IMG_2513.webp', 'Destacado', 'L'),
  (13, 'CAJA LARGA 24 ROSAS', 209.00, 'rosas', 'https://floreverperu.com/media/productos/variantes/CAJA-LARGA-24-ROSAS-S1.webp', null, 'XL'),
  (14, 'MINI CHOCO BOX', 139.00, 'box', 'https://floreverperu.com/media/productos/variantes/SV_-_MINI_CHOCO_BOX_-_S1.webp', 'Oferta', 'S'),
  (15, 'RAMO BEATRICE', 149.00, 'ramos', 'https://floreverperu.com/media/productos/variantes/SV_-_RAMO_BEATRICE-_S1_tambi%C3%A9n_va_en_el_cat%C3%A1logo_normal.webp', null, 'M'),
  (16, 'CAJA CON 12 ROSAS EDICION EUFLORIA + FERRERO ROCHER', 169.00, 'rosas', 'https://floreverperu.com/media/productos/variantes/IMG_6627.webp', 'Destacado · Oferta', 'L'),
  (17, 'CAJA LARGA 3 ROSAS', 69.00, 'rosas', 'https://floreverperu.com/media/productos/variantes/CAJA-LARGA-3-ROSAS-S2.webp', 'Express', 'S'),
  (18, 'PACK AMOR', 199.00, 'complementos', 'https://floreverperu.com/media/productos/variantes/12_Rosas.webp', null, 'M'),
  (19, 'CAJA LARGA 6 TULIPANES', 139.00, 'tulipanes', 'https://floreverperu.com/media/productos/variantes/CAJA-LARGA-6-TULIPANES-S1.webp', null, 'M'),
  (20, 'CAJA LARGA 6 GIRASOLES', 99.00, 'girasoles', 'https://floreverperu.com/media/productos/variantes/CAJA-LARGA-6-GIRASOLES-S1.webp', 'Oferta', 'M'),
  (21, 'GARDEN BOX', 309.00, 'box', 'https://floreverperu.com/media/productos/variantes/SV-GARDEN-BOX-BLANCA-S1.webp', 'Destacado · Oferta', 'XL'),
  (22, 'ROMANTIC FERRERO BOX', 249.00, 'box', 'https://floreverperu.com/media/productos/variantes/SV-ROMANTIC-FERRERO-BOX-S1.webp', 'Destacado', 'L'),
  (23, 'CAJA LARGA 12 TULIPANES', 229.00, 'tulipanes', 'https://floreverperu.com/media/productos/variantes/CAJA_LARGA_12_TULIPANES_-_S1.webp', 'Destacado', 'L'),
  (24, 'CAJA LARGA 3 TULIPANES', 89.00, 'tulipanes', 'https://floreverperu.com/media/productos/variantes/IMG_3019_jpg_1.webp', null, 'S'),
  (25, 'CAJA CON 12 TULIPANES EDICION EUFLORIA + CHOCOLATE LINAJE', 249.00, 'tulipanes', 'https://floreverperu.com/media/productos/variantes/CAJA_EUFLORIA_12_TULIPANES_CON_CHCOCOLATES_-_S2.webp', 'Oferta', 'L'),
  (26, 'SQUARE ROYAL BOX', 159.00, 'box', 'https://floreverperu.com/media/productos/variantes/SV-SQUARE-ROYAL-S1.webp', null, 'M'),
  (27, 'RAMO AMARANTA', 209.00, 'ramos', 'https://floreverperu.com/media/productos/variantes/6189D4ED-1686-4A1A-95F0-9703633BC7E0.webp', 'Destacado', 'M'),
  (28, 'CAJA CON 6 GIRASOLES EDICION EUFLORIA + CORAZON DE LA IBERICA', 119.00, 'girasoles', 'https://floreverperu.com/media/productos/variantes/CAJA_EUFLORIA_6_GIRASOLES_CON_CHOCOLATES_-_S1.webp', 'Destacado · Oferta', 'M'),
  (29, 'RAMO AMELIE', 229.00, 'ramos', 'https://floreverperu.com/media/productos/variantes/ChatGPT_Image_27_ene_2026_09_55_56_a.m..webp', 'Destacado', 'L'),
  (30, 'CAJA LARGA 12 ROSAS', 149.00, 'rosas', 'https://floreverperu.com/media/productos/variantes/CAJA-LARGA-12-ROSAS-S1.webp', 'Oferta', 'L'),
  (31, 'CAJA LARGA 24 TULIPANES', 329.00, 'tulipanes', 'https://floreverperu.com/media/productos/variantes/CAJA-LARGA-24-TULIPANES-S1.webp', null, 'XL'),
  (32, 'CAJA CHELERA', 69.00, 'complementos', 'https://floreverperu.com/media/productos/variantes/WhatsApp_Image_2026-04-27_at_4.10.24_PM_2.webp', 'Express · Oferta', 'S')
),
prepared as (
  select
    c.*,
    case c.category
      when 'ramos' then 'Ramo floral ' || c.name || ', pensado para regalar en momentos especiales.'
      when 'rosas' then 'Arreglo de rosas ' || c.name || ', en una presentación especial lista para regalar.'
      when 'tulipanes' then 'Arreglo con tulipanes ' || c.name || ', preparado para una ocasión especial.'
      when 'girasoles' then 'Arreglo con girasoles ' || c.name || ', una opción alegre para regalar.'
      when 'box' then 'Box floral o de regalo ' || c.name || ', presentado para ocasiones especiales.'
      when 'canasta' then 'Canasta floral ' || c.name || ', con una presentación elegante.'
      when 'flores' then 'Arreglo floral ' || c.name || ', con una presentación elegante.'
      when 'complementos' then 'Detalle complementario ' || c.name || ', pensado para acompañar una ocasión especial.'
      else 'Arreglo ' || c.name || ', preparado para ocasiones especiales.'
    end as description,
    'Colores, follaje, empaque y detalles decorativos pueden variar ligeramente según disponibilidad, manteniendo el estilo general de la presentación.'::text as note
  from catalog c
)
insert into public.products (name, description, price, category, image, tag, size, note, stock, active)
select p.name, p.description, p.price, p.category, p.image, p.tag, p.size, p.note, 10, true
from prepared p
where not exists (
  select 1 from public.products existing
  where lower(trim(existing.name)) = lower(trim(p.name))
);
