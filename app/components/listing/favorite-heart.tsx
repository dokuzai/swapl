"use client";

// Favorites heart overlay for browse/shelf cards (DOK-150). Web counterpart
// of the mobile heart: state syncs from GET /api/favorites/ids (fetched once
// per page load, shared across every heart via a module-level promise) and
// toggles through the existing idempotent PUT/DELETE /api/favorites/[id].
// Logged-out visitors still see the heart — clicking sends them to /login.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

// One fetch per page load, shared by all hearts. Resolves to the mutable Set
// of favorited ids (mutated on toggle so late-mounting hearts stay in sync),
// or null when the visitor is not authenticated.
let idsPromise: Promise<Set<string> | null> | null = null;

function loadFavoriteIds(): Promise<Set<string> | null> {
  if (!idsPromise) {
    idsPromise = fetch("/api/favorites/ids")
      .then(async (r) => (r.ok ? new Set<string>(((await r.json()) as { ids: string[] }).ids) : null))
      .catch(() => null);
  }
  return idsPromise;
}

/**
 * Shared favorites state for a listing: syncs from the per-page-load ids
 * fetch and exposes the optimistic toggle. Used by the browse-card heart
 * overlay below and by the detail page's inline Save action (DOK-150).
 */
export function useFavorite(listingId: string): { fav: boolean; toggle: () => Promise<void> } {
  const router = useRouter();
  const [fav, setFav] = useState(false);
  const [anon, setAnon] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadFavoriteIds().then((ids) => {
      if (cancelled) return;
      if (ids === null) setAnon(true);
      else setFav(ids.has(listingId));
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  async function toggle() {
    if (anon) {
      router.push("/login");
      return;
    }
    const next = !fav;
    setFav(next); // optimistic
    try {
      const res = await fetch(`/api/favorites/${listingId}`, { method: next ? "PUT" : "DELETE" });
      if (res.status === 401) {
        setFav(!next);
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const ids = await loadFavoriteIds();
      if (ids) (next ? ids.add(listingId) : ids.delete(listingId));
    } catch {
      setFav(!next); // roll back
    }
  }

  return { fav, toggle };
}

export function FavoriteHeart({ listingId, className }: { listingId: string; className?: string }) {
  const t = useT();
  const { fav, toggle } = useFavorite(listingId);

  return (
    <button
      type="button"
      aria-pressed={fav}
      aria-label={fav ? t("fav.remove") : t("fav.save")}
      title={fav ? t("fav.remove") : t("fav.save")}
      data-favorite-heart
      onClick={(e) => {
        // Hearts sit inside <Link> cards — keep the click from navigating.
        e.preventDefault();
        e.stopPropagation();
        void toggle();
      }}
      className={`absolute top-3 right-3 z-10 grid place-items-center w-9 h-9 rounded-full cursor-pointer transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 ${className ?? ""}`}
      style={{
        background: "rgba(255, 252, 245, 0.9)",
        border: "1px solid var(--line)",
        color: fav ? "var(--pink)" : "var(--navy-2)",
        outlineColor: "var(--pink)",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={fav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 20.5l-7.4-7.2A4.8 4.8 0 0 1 12 6.9a4.8 4.8 0 0 1 7.4 6.4L12 20.5z" />
      </svg>
    </button>
  );
}
