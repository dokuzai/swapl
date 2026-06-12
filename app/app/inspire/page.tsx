// /inspire — "Get Inspired" assistant flow (DOK-146). The layout already
// guarantees a session; everything interactive lives in the client component,
// which talks to POST /api/assistant/inspire and its confirm/dismiss routes.

import { InspireClient } from "./inspire-client";

export const metadata = { title: "Get Inspired · swapl" };

export default function InspirePage() {
  return <InspireClient />;
}
