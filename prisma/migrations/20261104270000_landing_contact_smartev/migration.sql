-- Actualizar teléfono y correo de contacto en la landing (CTA)
UPDATE "LandingSettings"
SET "content" = jsonb_set(
  jsonb_set(
    COALESCE("content"::jsonb, '{}'::jsonb),
    '{contact,phone}',
    '"+57 313 6768862"'::jsonb
  ),
  '{contact,email}',
  '"administracion@smartev.com.co"'::jsonb
)
WHERE id = 'default';
