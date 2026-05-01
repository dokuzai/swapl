// Uploadthing routers for swapl.
//
// `verificationVideo` accepts a single MP4/MOV up to 500 MB from authenticated
// users; the resulting URL is consumed by /api/listings/verify.
//
// `listingPhoto` accepts up to 20 images per listing, used by the listing
// creation form once we wire the dropzone (Loom URL upload still works as a
// parallel path for hosts who already have a video link).

import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getSession } from "@/lib/auth/session";

const f = createUploadthing();

export const ourFileRouter = {
  verificationVideo: f({
    video: { maxFileSize: "512MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getSession();
      if (!session) throw new UploadThingError("UNAUTHENTICATED");
      return { userId: session.userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // The browser receives `{ url, name, size }`. The verify route picks
      // the URL up via the form submission.
      return { uploadedBy: metadata.userId, url: file.ufsUrl };
    }),

  listingPhoto: f({
    image: { maxFileSize: "8MB", maxFileCount: 20 },
  })
    .middleware(async () => {
      const session = await getSession();
      if (!session) throw new UploadThingError("UNAUTHENTICATED");
      return { userId: session.userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { uploadedBy: metadata.userId, url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
