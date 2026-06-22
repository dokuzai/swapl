// One-off backfill: migrate existing swap chats into the unified per-transaction
// conversation model (DOK-221), and open a thread for every existing KeysStay.
//
// For each SwapProposal: ensure a Conversation, copy its SwapMessages → Message
// (kind=text), and copy ConversationRead → ConversationReadCursor. For each
// KeysStay: ensure a Conversation (so it appears in the unified Messages list).
//
// Idempotent — safe to re-run: a proposal's text messages are copied only if its
// conversation has none yet; cursors and conversations upsert.
//
// Local:
//   npx tsx scripts/backfill-conversations.ts            # apply
//   npx tsx scripts/backfill-conversations.ts --check    # dry run, print counts
// Prod (Neon):
//   npx prisma generate --schema prisma/schema.postgres.prisma
//   DATABASE_URL="<sw_DATABASE_URL_UNPOOLED>" npx tsx scripts/backfill-conversations.ts
//   npx prisma generate --schema prisma/schema.prisma   # restore local client

import { prisma } from "@/lib/db";

async function main() {
  const dryRun = process.argv.includes("--check");
  let convosCreated = 0;
  let messagesCopied = 0;
  let cursorsCopied = 0;

  // ---- Swaps ----
  const proposals = await prisma.swapProposal.findMany({ select: { id: true } });
  for (const p of proposals) {
    const convo = await prisma.conversation.findUnique({ where: { proposalId: p.id } });
    let convoId = convo?.id;
    if (!convoId) {
      convosCreated++;
      if (!dryRun) convoId = (await prisma.conversation.create({ data: { proposalId: p.id } })).id;
    }

    // Copy messages only if this thread has no text rows yet (re-run safe).
    const alreadyHasText = convoId
      ? (await prisma.message.count({ where: { conversationId: convoId, kind: "text" } })) > 0
      : false;
    if (!alreadyHasText) {
      const msgs = await prisma.swapMessage.findMany({
        where: { proposalId: p.id },
        orderBy: { createdAt: "asc" },
        select: { authorId: true, body: true, photos: true, createdAt: true },
      });
      messagesCopied += msgs.length;
      if (!dryRun && convoId && msgs.length) {
        await prisma.message.createMany({
          data: msgs.map((m) => ({
            conversationId: convoId!,
            authorId: m.authorId,
            kind: "text",
            body: m.body,
            photos: m.photos,
            createdAt: m.createdAt,
          })),
        });
      }
    }

    const reads = await prisma.conversationRead.findMany({
      where: { proposalId: p.id },
      select: { userId: true, lastReadAt: true },
    });
    cursorsCopied += reads.length;
    if (!dryRun && convoId) {
      for (const r of reads) {
        await prisma.conversationReadCursor.upsert({
          where: { conversationId_userId: { conversationId: convoId, userId: r.userId } },
          update: { lastReadAt: r.lastReadAt },
          create: { conversationId: convoId, userId: r.userId, lastReadAt: r.lastReadAt },
        });
      }
    }
  }

  // ---- Stays ----
  const stays = await prisma.keysStay.findMany({ select: { id: true } });
  for (const s of stays) {
    const exists = await prisma.conversation.findUnique({ where: { keysStayId: s.id } });
    if (!exists) {
      convosCreated++;
      if (!dryRun) await prisma.conversation.create({ data: { keysStayId: s.id } });
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}proposals=${proposals.length} stays=${stays.length} ` +
      `conversationsCreated=${convosCreated} messagesCopied=${messagesCopied} cursorsCopied=${cursorsCopied}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
