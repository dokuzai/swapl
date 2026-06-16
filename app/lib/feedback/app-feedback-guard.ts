// Client-side no-re-nag guard for contextual app-feedback prompts (DOK-190).
//
// The server already dedupes *submissions* via an upsert on
// (userId, surface, contextKey), so a given prompt can be submitted only once.
// But a member who *dismisses* a prompt without submitting would otherwise see
// it again on the next view. To avoid that, each contextual trigger records a
// localStorage marker once the prompt is resolved (submitted OR dismissed), and
// refuses to auto-open while the marker is present.
//
// Key shape: `swapl.appfb.{surface}.{contextKey}` (contextKey is the agreementId
// for the post-swap / post-review surfaces).

import type { FeedbackSurface } from "@/components/feedback/app-rating-dialog";

function guardKey(surface: FeedbackSurface, contextKey: string): string {
  return `swapl.appfb.${surface}.${contextKey}`;
}

/** True if this prompt has already been resolved (submitted or dismissed). */
export function isAppFeedbackResolved(surface: FeedbackSurface, contextKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(guardKey(surface, contextKey)) != null;
  } catch {
    // Private mode / storage disabled — fail open (we'd rather show the prompt
    // than crash). The server upsert still prevents duplicate submissions.
    return false;
  }
}

/** Mark this prompt resolved so it won't auto-open again on this device. */
export function markAppFeedbackResolved(surface: FeedbackSurface, contextKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(guardKey(surface, contextKey), String(Date.now()));
  } catch {
    // Ignore — see note above.
  }
}
