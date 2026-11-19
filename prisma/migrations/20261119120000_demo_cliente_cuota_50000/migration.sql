-- Cuota de prueba Wompi: cliente@gmail.com paga 50.000 COP por transacción
UPDATE "ClientVehiclePlan" AS p
SET
  "installmentAmountCop" = 50000,
  "updatedAt" = NOW()
FROM "User" AS u
WHERE p."userId" = u.id
  AND lower(u.email) = 'cliente@gmail.com';

INSERT INTO "ClientVehiclePlan" (
  "userId",
  "vehicleName",
  "vin",
  "deliveredAt",
  "nextInspectionDueAt",
  "installmentAmountCop",
  "installmentCount",
  "createdAt",
  "updatedAt"
)
SELECT
  u.id,
  'Dongfeng Nammi',
  'LNBM2EV3XDEMO1234',
  NOW() - INTERVAL '3 months',
  NOW() + INTERVAL '3 months',
  50000,
  26,
  NOW(),
  NOW()
FROM "User" AS u
WHERE lower(u.email) = 'cliente@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM "ClientVehiclePlan" p WHERE p."userId" = u.id
  );