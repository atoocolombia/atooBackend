ALTER TABLE "VehicleDelivery" ADD COLUMN IF NOT EXISTS "onboardingToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleDelivery_onboardingToken_key" ON "VehicleDelivery"("onboardingToken");
