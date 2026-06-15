// Co-traveler (guest) view of a swap conversation (DOK-187).
//
// Guests invited into a swap thread can read and write messages and see who
// else is in the conversation (the People panel), but they never see the swap
// cockpit, key codes, the agreement, or the accept/counter/decline controls —
// those stay with the two swap principals. This is a deliberately stripped-down
// page: header + chat + People panel, no swap actions.

import Link from "next/link";
import { ChatThread } from "./chat-thread";
import { PeoplePanel } from "./people-panel";

export function GuestThreadPage({
  proposalId,
  status,
  threadTitle,
  dateRange,
  chatName,
}: {
  proposalId: string;
  status: string;
  threadTitle: string;
  dateRange: string;
  chatName: string;
}) {
  return (
    <div className="wrap py-6 lg:py-10">
      <Link
        href="/swaps"
        className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block"
        style={{ color: "var(--navy-3)" }}
      >
        ← All swaps
      </Link>

      <div className="lg:grid lg:gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0">
          <header className="mb-6">
            <p className="kicker mb-3">Conversation · {status.toLowerCase()}</p>
            <h1 className="font-display text-3xl lg:text-4xl tracking-[-0.02em] leading-[1.05] font-medium">
              {threadTitle}
            </h1>
            <p className="mt-3" style={{ color: "var(--navy-2)" }}>
              {dateRange}
            </p>
          </header>

          {/* Mobile: People panel collapses above the thread. */}
          <div className="lg:hidden mb-6">
            <PeoplePanel proposalId={proposalId} isPrincipal={false} />
          </div>

          <div id="chat" className="mb-6">
            <ChatThread proposalId={proposalId} otherName={chatName} />
          </div>
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-24" aria-label="People in this conversation">
          <PeoplePanel proposalId={proposalId} isPrincipal={false} />
        </aside>
      </div>
    </div>
  );
}
