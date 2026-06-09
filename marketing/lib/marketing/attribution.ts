export const ATTRIBUTION_KEYS = {
  source: ["utm_source", "source"],
  medium: ["utm_medium", "medium"],
  campaign: ["utm_campaign", "campaign"],
  term: ["utm_term", "term"],
  content: ["utm_content", "content"],
} as const;

export type AttributionPayload = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landingPage?: string;
  path?: string;
  referrer?: string;
};

export function attributionFromSearchParams(
  searchParams: URLSearchParams,
  pathname: string,
): AttributionPayload {
  const payload: AttributionPayload = {};
  for (const [field, keys] of Object.entries(ATTRIBUTION_KEYS)) {
    const value = keys.map((key) => searchParams.get(key)).find(Boolean);
    if (value) (payload as Record<string, string>)[field] = value;
  }
  const query = searchParams.toString();
  const path = query ? `${pathname}?${query}` : pathname;
  payload.path = path;
  payload.landingPage = path;
  if (typeof document !== "undefined" && document.referrer) {
    payload.referrer = document.referrer;
  }
  return payload;
}

export function trackMarketingEvent(
  eventName: string,
  payload: AttributionPayload & { metadata?: Record<string, unknown> },
) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ eventName, ...payload });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/marketing/events", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/marketing/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
