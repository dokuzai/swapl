-- DOK-186: AI property-document verification fields + business-property ineligibility gate.
-- All JSON-bearing columns are TEXT (parsed via parseJSON) to match the dual-schema convention.

ALTER TABLE "PropertyVerification" ADD COLUMN "aiClassification" TEXT;
ALTER TABLE "PropertyVerification" ADD COLUMN "aiConfidence" REAL;
ALTER TABLE "PropertyVerification" ADD COLUMN "aiReasons" TEXT;
ALTER TABLE "PropertyVerification" ADD COLUMN "aiEntityType" TEXT;
ALTER TABLE "PropertyVerification" ADD COLUMN "documentType" TEXT;

ALTER TABLE "Listing" ADD COLUMN "ineligibleReason" TEXT;
ALTER TABLE "Listing" ADD COLUMN "ineligibleAt" DATETIME;
