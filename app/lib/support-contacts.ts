"use client";

// Client hook for GET /api/config/support-contacts — the 24/7 phone line and
// help-centre URL that the "Report a problem" flow surfaces. These used to be
// hardcoded in each component; now they come from one server endpoint so ops
// can change them without a release.
//
// Best-effort: until the fetch resolves (or if it fails) callers get the launch
// defaults, so the UI never blocks on this lookup or renders an empty number.

import { useEffect, useState } from "react";

export type SupportContacts = {
  phone: string;
  helpUrl: string;
};

export const SUPPORT_CONTACTS_FALLBACK: SupportContacts = {
  phone: "+44 800 000 swap",
  helpUrl: "https://swapl.fun/help",
};

export function useSupportContacts(): SupportContacts {
  const [contacts, setContacts] = useState<SupportContacts>(SUPPORT_CONTACTS_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/config/support-contacts", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<SupportContacts>;
        if (cancelled) return;
        setContacts({
          phone: data.phone?.trim() || SUPPORT_CONTACTS_FALLBACK.phone,
          helpUrl: data.helpUrl?.trim() || SUPPORT_CONTACTS_FALLBACK.helpUrl,
        });
      } catch {
        // Keep the fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return contacts;
}
