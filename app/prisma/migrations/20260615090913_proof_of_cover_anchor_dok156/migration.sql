-- AlterTable
ALTER TABLE "InsurancePolicy" ADD COLUMN "anchoredAt" DATETIME;
ALTER TABLE "InsurancePolicy" ADD COLUMN "onChainNetwork" TEXT;
ALTER TABLE "InsurancePolicy" ADD COLUMN "onChainRef" TEXT;
ALTER TABLE "InsurancePolicy" ADD COLUMN "onChainStatus" TEXT;
