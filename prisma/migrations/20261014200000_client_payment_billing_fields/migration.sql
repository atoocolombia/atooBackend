-- Campos adicionales para facturación electrónica y trazabilidad del pago
ALTER TABLE "ClientPayment" ADD COLUMN IF NOT EXISTS "clientEmail" TEXT;
ALTER TABLE "ClientPayment" ADD COLUMN IF NOT EXISTS "clientPhone" TEXT;
ALTER TABLE "ClientPayment" ADD COLUMN IF NOT EXISTS "clientAddress" TEXT;
ALTER TABLE "ClientPayment" ADD COLUMN IF NOT EXISTS "idDocumentType" TEXT NOT NULL DEFAULT 'CC';
ALTER TABLE "ClientPayment" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "ClientPayment" ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;
ALTER TABLE "ClientPayment" ADD COLUMN IF NOT EXISTS "payerName" TEXT;
