-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "monthlyCents" INTEGER NOT NULL DEFAULT 0,
    "yearlyCents" INTEGER NOT NULL DEFAULT 0,
    "stripePriceMonthly" TEXT,
    "stripePriceYearly" TEXT,
    "maxListings" INTEGER NOT NULL DEFAULT 0,
    "maxProposalsMonth" INTEGER NOT NULL DEFAULT 0,
    "prioritySearch" TEXT NOT NULL DEFAULT 'standard',
    "fullFilters" BOOLEAN NOT NULL DEFAULT false,
    "calendarSync" BOOLEAN NOT NULL DEFAULT false,
    "matchBreakdown" BOOLEAN NOT NULL DEFAULT false,
    "listingAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "multiHomeTeams" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodStart" DATETIME NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'stripe',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StripeCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stripeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "taxId" TEXT,
    "countryCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stripeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AddOn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderAddOn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "amountCents" INTEGER NOT NULL,
    "stripePaymentIntentId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderAddOn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderAddOn_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SwapAgreement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderAddOn_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "AddOn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListingVerificationPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingVerificationPayment_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListingFeaturedPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingFeaturedPurchase_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "seatCount" INTEGER NOT NULL DEFAULT 5,
    "planStatus" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" DATETIME,
    CONSTRAINT "OrganizationMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CorporateLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "employeeCount" INTEGER,
    "useCase" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AffiliatePartner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "trackingParam" TEXT NOT NULL,
    "commissionModel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "agreementId" TEXT,
    "partnerSlug" TEXT NOT NULL,
    "partnerId" TEXT,
    "destinationCity" TEXT,
    "utmCampaign" TEXT,
    "clickedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AffiliateClick_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InsurancePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'swapl-cover',
    "policyNumber" TEXT NOT NULL,
    "coverageAmount" INTEGER NOT NULL DEFAULT 150000,
    "status" TEXT NOT NULL DEFAULT 'active',
    "premiumCents" INTEGER NOT NULL DEFAULT 0,
    "platformShareCents" INTEGER NOT NULL DEFAULT 0,
    "documentsUrl" TEXT,
    "externalId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsurancePolicy_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SwapAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InsurancePolicy" ("agreementId", "coverageAmount", "createdAt", "expiresAt", "id", "policyNumber", "provider") SELECT "agreementId", "coverageAmount", "createdAt", "expiresAt", "id", "policyNumber", "provider" FROM "InsurancePolicy";
DROP TABLE "InsurancePolicy";
ALTER TABLE "new_InsurancePolicy" RENAME TO "InsurancePolicy";
CREATE UNIQUE INDEX "InsurancePolicy_agreementId_key" ON "InsurancePolicy"("agreementId");
CREATE TABLE "new_Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "neighbourhood" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "address" TEXT,
    "lat" REAL,
    "lng" REAL,
    "sizeSqm" INTEGER NOT NULL,
    "sleeps" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "floor" INTEGER,
    "hasElevator" BOOLEAN NOT NULL DEFAULT false,
    "stepFreeAccess" BOOLEAN NOT NULL DEFAULT false,
    "petsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "petTypes" TEXT NOT NULL DEFAULT '[]',
    "wfhSetup" BOOLEAN NOT NULL DEFAULT false,
    "wfhDesks" INTEGER NOT NULL DEFAULT 0,
    "hasParking" BOOLEAN NOT NULL DEFAULT false,
    "bikeIncluded" BOOLEAN NOT NULL DEFAULT false,
    "rooftop" BOOLEAN NOT NULL DEFAULT false,
    "balcony" BOOLEAN NOT NULL DEFAULT false,
    "garden" BOOLEAN NOT NULL DEFAULT false,
    "courtyard" BOOLEAN NOT NULL DEFAULT false,
    "piano" BOOLEAN NOT NULL DEFAULT false,
    "pool" BOOLEAN NOT NULL DEFAULT false,
    "gym" BOOLEAN NOT NULL DEFAULT false,
    "ac" BOOLEAN NOT NULL DEFAULT false,
    "dishwasher" BOOLEAN NOT NULL DEFAULT false,
    "washer" BOOLEAN NOT NULL DEFAULT false,
    "dryer" BOOLEAN NOT NULL DEFAULT false,
    "availableFrom" DATETIME NOT NULL,
    "availableTo" DATETIME NOT NULL,
    "minStayDays" INTEGER NOT NULL DEFAULT 3,
    "maxStayDays" INTEGER NOT NULL DEFAULT 30,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "paletteHint" TEXT,
    "motifHint" TEXT,
    "postcard" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'none',
    "verificationVideoUrl" TEXT,
    "verificationSubmittedAt" DATETIME,
    "verificationReviewedAt" DATETIME,
    "verificationReviewerId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("ac", "address", "availableFrom", "availableTo", "balcony", "bathrooms", "bedrooms", "bikeIncluded", "city", "country", "courtyard", "createdAt", "description", "dishwasher", "dryer", "floor", "garden", "gym", "hasElevator", "hasParking", "id", "isActive", "lat", "lng", "maxStayDays", "minStayDays", "motifHint", "neighbourhood", "paletteHint", "petTypes", "petsAllowed", "photos", "piano", "pool", "postcard", "propertyType", "rooftop", "sizeSqm", "sleeps", "stepFreeAccess", "tags", "title", "updatedAt", "userId", "washer", "wfhDesks", "wfhSetup") SELECT "ac", "address", "availableFrom", "availableTo", "balcony", "bathrooms", "bedrooms", "bikeIncluded", "city", "country", "courtyard", "createdAt", "description", "dishwasher", "dryer", "floor", "garden", "gym", "hasElevator", "hasParking", "id", "isActive", "lat", "lng", "maxStayDays", "minStayDays", "motifHint", "neighbourhood", "paletteHint", "petTypes", "petsAllowed", "photos", "piano", "pool", "postcard", "propertyType", "rooftop", "sizeSqm", "sleeps", "stepFreeAccess", "tags", "title", "updatedAt", "userId", "washer", "wfhDesks", "wfhSetup" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
CREATE INDEX "Listing_city_idx" ON "Listing"("city");
CREATE INDEX "Listing_userId_idx" ON "Listing"("userId");
CREATE INDEX "Listing_isActive_idx" ON "Listing"("isActive");
CREATE INDEX "Listing_isFeatured_featuredUntil_idx" ON "Listing"("isFeatured", "featuredUntil");
CREATE INDEX "Listing_isVerified_idx" ON "Listing"("isVerified");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "passwordHash" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiApiKey" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "proposalsThisMonthCount" INTEGER NOT NULL DEFAULT 0,
    "proposalsCounterResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hideSponsoredContent" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("aiApiKey", "aiModel", "aiProvider", "avatar", "bio", "createdAt", "email", "id", "name", "passwordHash", "verified") SELECT "aiApiKey", "aiModel", "aiProvider", "avatar", "bio", "createdAt", "email", "id", "name", "passwordHash", "verified" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_planId_status_idx" ON "Subscription"("planId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_userId_key" ON "StripeCustomer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_stripeId_key" ON "StripeCustomer"("stripeId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_stripeId_key" ON "BillingEvent"("stripeId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_stripeInvoiceId_key" ON "BillingInvoice"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AddOn_slug_key" ON "AddOn"("slug");

-- CreateIndex
CREATE INDEX "OrderAddOn_userId_idx" ON "OrderAddOn"("userId");

-- CreateIndex
CREATE INDEX "OrderAddOn_agreementId_idx" ON "OrderAddOn"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingVerificationPayment_listingId_key" ON "ListingVerificationPayment"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingVerificationPayment_stripePaymentIntentId_key" ON "ListingVerificationPayment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingFeaturedPurchase_stripePaymentIntentId_key" ON "ListingFeaturedPurchase"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "ListingFeaturedPurchase_listingId_endsAt_idx" ON "ListingFeaturedPurchase"("listingId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_orgId_userId_key" ON "OrganizationMember"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePartner_slug_key" ON "AffiliatePartner"("slug");

-- CreateIndex
CREATE INDEX "AffiliateClick_partnerSlug_idx" ON "AffiliateClick"("partnerSlug");

-- CreateIndex
CREATE INDEX "AffiliateClick_destinationCity_idx" ON "AffiliateClick"("destinationCity");
