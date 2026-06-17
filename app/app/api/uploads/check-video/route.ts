// Native-friendly check-in/out condition video upload. iOS/Android POST a
// single multipart video (audio narration baked in) with a Bearer token; we
// store it in UploadThing via the server UTApi and return its URL for inclusion
// in the check-event's videoUrl. Web is view-only and does not hit this route.
//
// Requires UPLOADTHING_TOKEN in the environment (UTApi reads it automatically).

import { NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { checkRateLimitDurable } from "@/lib/rate-limit";

const MAX_BYTES = 256 * 1024 * 1024; // 256 MB — a short phone clip with audio.
const UPLOAD_LIMIT = 20;
const UPLOAD_WINDOW_MS = 60 * 60 * 1000;
// Concrete container types only. Phone captures are H.264/HEVC in MP4 or QuickTime.
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
]);

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const rl = await checkRateLimitDurable(`upload:check-video:${session.userId}`, UPLOAD_LIMIT, UPLOAD_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  if (!process.env.UPLOADTHING_TOKEN) {
    return NextResponse.json({ error: "Uploads are not configured." }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only MP4 or QuickTime videos are allowed." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Video too large (max 256MB)." }, { status: 413 });
  }

  const utapi = new UTApi();
  const result = await utapi.uploadFiles(file);
  if (result.error || !result.data) {
    return NextResponse.json({ error: "Upload failed." }, { status: 502 });
  }
  return NextResponse.json({ url: result.data.ufsUrl });
}
