// Native-friendly photo upload. iOS/Android POST a single multipart image with
// a Bearer token; we store it in UploadThing via the server UTApi (no UT JS SDK
// needed on device) and return its URL for inclusion in listing.photos.
//
// Requires UPLOADTHING_TOKEN in the environment (UTApi reads it automatically).

import { NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";
import { getSessionFromRequest } from "@/lib/auth/session";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB, matching the web listingPhoto router

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  if (!process.env.UPLOADTHING_TOKEN) {
    return NextResponse.json({ error: "Uploads are not configured." }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are allowed." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 8MB)." }, { status: 413 });
  }

  const utapi = new UTApi();
  const result = await utapi.uploadFiles(file);
  if (result.error || !result.data) {
    return NextResponse.json({ error: "Upload failed." }, { status: 502 });
  }
  return NextResponse.json({ url: result.data.ufsUrl });
}
