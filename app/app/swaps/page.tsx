import { getSession } from "@/lib/auth/session";
import { getI18n, t } from "@/lib/i18n/server";
import { getConversations, isArchived } from "./conversations";
import { ConversationList } from "./conversation-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your swaps · swapl" };

// Three-pane messages inbox (DOK-150). On mobile this page is the master
// list; selecting a conversation navigates to /swaps/[id]. On desktop the
// detail route re-renders the list as its left column, so navigation feels
// master-detail without breaking the existing /swaps/[id] route.
export default async function SwapsInbox() {
  const session = await getSession();
  // layout redirects, but type-narrow:
  if (!session) return null;

  const { dict } = await getI18n();

  const conversations = await getConversations(session.userId);
  const waitingOnYou = conversations.filter((c) => c.role === "hosting" && !isArchived(c.status) && c.status !== "ACCEPTED");
  const waitingOnThem = conversations.filter((c) => c.role === "traveling" && !isArchived(c.status) && c.status !== "ACCEPTED");
  const active = conversations.filter((c) => c.status === "ACCEPTED");

  return (
    <div className="wrap py-10 lg:py-14">
      <header className="mb-8">
        <h1 className="font-display text-4xl tracking-[-0.02em] font-medium">{t(dict, "swaps.inbox.title")}</h1>
        <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>
          {t(dict, "swaps.inbox.waitingOnYou", { n: waitingOnYou.length })} ·{" "}
          {t(dict, "swaps.inbox.waitingOnThem", { n: waitingOnThem.length })} ·{" "}
          {t(dict, "swaps.inbox.active", { n: active.length })}
        </p>
      </header>

      <div className="lg:grid lg:gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <ConversationList conversations={conversations} />

        {/* Empty detail pane — desktop only, until a conversation is selected. */}
        <div
          className="hidden lg:flex surface-card min-h-[420px] items-center justify-center text-center p-10"
          aria-hidden={conversations.length === 0}
        >
          <div>
            <p className="kicker mb-3">{t(dict, "swaps.yourSwaps")}</p>
            <p className="font-display text-2xl tracking-[-0.01em]">
              {conversations.length === 0 ? t(dict, "swaps.empty.title") : t(dict, "swaps.select.title")}
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--navy-2)" }}>
              {conversations.length === 0 ? t(dict, "swaps.empty.body") : t(dict, "swaps.select.body")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
