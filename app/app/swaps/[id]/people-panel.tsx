"use client";

// "People" panel for the multi-party swap conversation (DOK-187).
//
// Shows everyone in the thread — the two swap principals plus any invited
// co-travelers (guests), with a status badge ("pending" until they sign in).
// Visible to every participant. For the two PRINCIPALS only, it also exposes
// an invite affordance (by email or by handle/userId), a one-tap "add
// co-travelers" quick-pick, and a remove control on each guest.
//
// Client/server boundary: this is a pure client component that talks only to
// the participant DTO endpoints — no server imports, no lib/db.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

type Participant = {
  id: string;
  userId: string | null;
  invitedEmail: string | null;
  name: string | null;
  avatar: string | null;
  role: "principal" | "guest_participant";
  status: "active" | "pending" | "removed";
};

type Suggestion = {
  userId: string;
  name: string | null;
  avatar: string | null;
};

export function PeoplePanel({
  proposalId,
  isPrincipal,
}: {
  proposalId: string;
  /** Only the two swap parties get the invite/remove controls. */
  isPrincipal: boolean;
}) {
  const t = useT();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}/participants`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { participants: Participant[] };
      setParticipants(data.participants);
    } catch {
      // best-effort
    } finally {
      setLoaded(true);
    }
  }, [proposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const guestCount = participants.filter((p) => p.role === "guest_participant").length;

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {t("people.title")}
        </div>
        {isPrincipal && (
          <button
            type="button"
            onClick={() => setInviteOpen((v) => !v)}
            className="font-mono text-[11px] uppercase tracking-[.08em]"
            style={{ color: "var(--pink)" }}
          >
            {inviteOpen ? t("people.close") : t("people.invite")}
          </button>
        )}
      </div>

      <p className="text-xs mb-3" style={{ color: "var(--navy-3)" }}>
        {guestCount > 0 ? t("people.subtitleWithGuests") : t("people.subtitle")}
      </p>

      {!loaded ? (
        <p className="text-sm" style={{ color: "var(--navy-3)" }}>
          …
        </p>
      ) : (
        <ul className="space-y-2">
          {participants.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              canRemove={isPrincipal && p.role === "guest_participant"}
              proposalId={proposalId}
              onRemoved={() =>
                setParticipants((prev) => prev.filter((x) => x.id !== p.id))
              }
              t={t}
            />
          ))}
        </ul>
      )}

      {isPrincipal && inviteOpen && (
        <InvitePanel
          proposalId={proposalId}
          existing={participants}
          onInvited={(participant) =>
            setParticipants((prev) => {
              // Replace any same-id row (idempotent re-invite) or append.
              const without = prev.filter((x) => x.id !== participant.id);
              return [...without, participant];
            })
          }
          t={t}
        />
      )}
    </div>
  );
}

function PersonRow({
  person,
  canRemove,
  proposalId,
  onRemoved,
  t,
}: {
  person: Participant;
  canRemove: boolean;
  proposalId: string;
  onRemoved: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(false);

  const label =
    person.name ?? person.invitedEmail ?? t("people.unknownPerson");

  async function remove() {
    if (removing) return;
    setRemoving(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/proposals/${proposalId}/participants/${person.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      onRemoved();
    } catch {
      setError(true);
      setRemoving(false);
    }
  }

  return (
    <li className="flex items-center gap-3">
      <Avatar name={label} avatar={person.avatar} />
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate" style={{ color: "var(--navy)" }}>
          {label}
        </div>
        <div className="flex items-center gap-2">
          {person.role === "principal" ? (
            <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
              {t("people.role.principal")}
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
              {t("people.role.guest")}
            </span>
          )}
          {person.status === "pending" && (
            <span
              className="font-mono text-[9px] uppercase tracking-[.08em] px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--cream-2)", color: "var(--navy-2)" }}
            >
              {t("people.status.pending")}
            </span>
          )}
        </div>
        {error && (
          <p className="text-[11px] mt-0.5" style={{ color: "var(--pink)" }}>
            {t("people.removeError")}
          </p>
        )}
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          aria-label={t("people.remove")}
          title={t("people.remove")}
          className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-sm"
          style={{ color: "var(--navy-3)", opacity: removing ? 0.5 : 1 }}
        >
          ×
        </button>
      )}
    </li>
  );
}

function InvitePanel({
  proposalId,
  existing,
  onInvited,
  t,
}: {
  proposalId: string;
  existing: Participant[];
  onInvited: (p: Participant) => void;
  t: ReturnType<typeof useT>;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const suggestionsLoaded = useRef(false);

  // Pull the "people you've swapped with" quick-pick once when opened.
  useEffect(() => {
    if (suggestionsLoaded.current) return;
    suggestionsLoaded.current = true;
    fetch(`/api/proposals/${proposalId}/participants/suggestions`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { suggestions: Suggestion[] } | null) => {
        if (d?.suggestions) setSuggestions(d.suggestions);
      })
      .catch(() => {});
  }, [proposalId]);

  const existingUserIds = useMemo(
    () => new Set(existing.map((p) => p.userId).filter(Boolean) as string[]),
    [existing]
  );
  const visibleSuggestions = suggestions.filter((s) => !existingUserIds.has(s.userId));

  async function invite(body: { byEmail: string } | { byUserId: string }) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        setError(t("people.inviteForbidden"));
        return;
      }
      if (!res.ok) {
        setError(t("people.inviteError"));
        return;
      }
      const data = (await res.json()) as {
        participant?: Participant;
        alreadyMember?: boolean;
      };
      if (data.participant) {
        onInvited(data.participant);
        setValue("");
      } else if (data.alreadyMember) {
        setError(t("people.alreadyMember"));
      }
    } catch {
      setError(t("people.inviteError"));
    } finally {
      setSending(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v || sending) return;
    // An "@" means an email; otherwise treat it as a handle/userId.
    if (v.includes("@")) {
      void invite({ byEmail: v });
    } else {
      void invite({ byUserId: v });
    }
  }

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
      <p className="text-xs mb-3" style={{ color: "var(--navy-2)" }}>
        {t("people.inviteHelp")}
      </p>

      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("people.invitePlaceholder")}
          className="flex-1 rounded-2xl px-3.5 py-2 text-sm outline-none min-w-0"
          style={{ border: "1px solid var(--line)", background: "var(--cream)" }}
        />
        <button
          type="submit"
          disabled={!value.trim() || sending}
          className="pill-primary shrink-0 h-9 px-4"
          style={{ opacity: !value.trim() || sending ? 0.5 : 1 }}
        >
          {sending ? t("people.inviting") : t("people.inviteAction")}
        </button>
      </form>

      {error && (
        <p className="text-[11px] mt-2" style={{ color: "var(--pink)" }}>
          {error}
        </p>
      )}

      {visibleSuggestions.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-[10px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--navy-3)" }}>
            {t("people.coTravelers")}
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleSuggestions.map((s) => (
              <button
                key={s.userId}
                type="button"
                disabled={sending}
                onClick={() => void invite({ byUserId: s.userId })}
                className="flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 border text-sm"
                style={{ borderColor: "var(--line)", color: "var(--navy)", opacity: sending ? 0.6 : 1 }}
              >
                <Avatar name={s.name ?? "?"} avatar={s.avatar} size={22} />
                <span className="truncate max-w-[8rem]">{s.name ?? t("people.unknownPerson")}</span>
                <span aria-hidden style={{ color: "var(--pink)" }}>
                  +
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, avatar, size = 32 }: { name: string; avatar: string | null; size?: number }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  if (avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatar}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="rounded-full grid place-items-center shrink-0 font-display"
      style={{
        width: size,
        height: size,
        background: "var(--cream-2)",
        color: "var(--navy-2)",
        fontSize: size * 0.42,
      }}
    >
      {initial}
    </span>
  );
}
