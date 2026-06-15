-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "userId" TEXT,
    "invitedEmail" TEXT,
    "role" TEXT NOT NULL DEFAULT 'guest_participant',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invitedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConversationParticipant_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "SwapProposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConversationParticipant_proposalId_idx" ON "ConversationParticipant"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_proposalId_userId_key" ON "ConversationParticipant"("proposalId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_proposalId_invitedEmail_key" ON "ConversationParticipant"("proposalId", "invitedEmail");
