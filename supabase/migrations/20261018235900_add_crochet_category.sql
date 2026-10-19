-- Add Crochet as a first-class product category and move ETERNA catalog items.
BEGIN;

ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_category_check;

ALTER TABLE public.products
    ADD CONSTRAINT products_category_check
    CHECK (category IN (
        'tulipanes',
        'girasoles',
        'ramos',
        'crochet',
        'rosas',
        'box',
        'canasta',
        'flores',
        'complementos',
        'cajas',
        'ramos_buchones'
    ));

UPDATE public.products
SET category = 'crochet',
    image = CASE name
        WHEN 'Eterno Amor' THEN 'https://raw.githubusercontent.com/Chemsito/Kantu-Floral/main/assets/catalog/ETERNA/eterno-amor.jpeg'
        WHEN 'Bouquet de rosas 💐' THEN 'https://raw.githubusercontent.com/Chemsito/Kantu-Floral/main/assets/catalog/ETERNA/bouquet-de-rosas.jpeg'
        ELSE image
    END
WHERE tag = 'ETERNA - Crochet 🧶'
  AND name IN ('Eterno Amor', 'Bouquet de rosas 💐');

INSERT INTO public.products (
    name,
    description,
    price,
    category,
    image,
    tag,
    stock,
    active,
    size,
    note,
    featured,
    recommendation_priority,
    recommendation_audiences,
    recommendation_occasions,
    recommendation_styles
)
SELECT
    'Eterna Primavera',
    'Ramo de flores a crochet en tonos amarillos, elaborado a mano con detalles decorativos. Un regalo especial que dura para siempre. 🧶🌻',
    70.00,
    'crochet',
    'https://raw.githubusercontent.com/Chemsito/Kantu-Floral/main/assets/catalog/ETERNA/eterna-primavera.webp',
    'ETERNA - Crochet 🧶',
    10,
    true,
    'M',
    'IMPORTANTE: La elaboración de este tipo de ramos demora 1 mes como mínimo, preguntar la demora antes porfavor.',
    false,
    10,
    ARRAY['pareja', 'mama', 'amiga', 'familiar', 'otro']::text[],
    ARRAY['cumpleanos', 'aniversario', 'amor', 'gracias', 'primera_cita', 'sorpresa']::text[],
    ARRAY['romantico', 'tierno', 'elegante', 'impactante', 'alegre']::text[]
WHERE NOT EXISTS (
    SELECT 1
    FROM public.products
    WHERE lower(name) = lower('Eterna Primavera')
      AND tag = 'ETERNA - Crochet 🧶'
);

