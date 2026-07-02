// Server-side UploadThing helpers (kept out of the client lib/uploadthing.ts,
// which pulls in @uploadthing/react). Used to delete blobs we no longer want to
// retain — e.g. property-ownership documents once a verification is decided.

import { UTApi } from "uploadthing/server";

// The UploadThing file key is the LAST path segment of a ufsUrl:
//   https://<appId>.ufs.sh/f/<KEY>  |  https://utfs.io/f/<KEY>
// Returns null for non-UploadThing hosts or malformed input.
export function fileKeyFromUploadThingUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const isUT = host === "utfs.io" || host.endsWith(".ufs.sh") || host.endsWith(".utfs.io");
    if (!isUT) return null;
    const seg = u.pathname.split("/").filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : null;
  } catch {
    return null;
  }
}

// Best-effort, NON-FATAL delete of UploadThing blobs by URL. Never throws —
// retention cleanup must never break the calling flow (e.g. a verification
// decision). No-ops when the token is unset or no URLs resolve to a key.
export async function deleteUploadThingUrls(urls: string[]): Promise<void> {
  const keys = urls.map(fileKeyFromUploadThingUrl).filter((k): k is string => !!k);
  if (keys.length === 0) return;
  if (!process.env.UPLOADTHING_TOKEN) return;
  try {
    await new UTApi().deleteFiles(keys);
  } catch (err) {
    console.error("[uploadthing:delete]", err);
  }
}
