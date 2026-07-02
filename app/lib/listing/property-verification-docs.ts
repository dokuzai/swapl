// JRN-HPre-01 retention: once a property verification reaches a TERMINAL state
// (approved/rejected), the ownership document is no longer needed — delete the
// uploaded blobs and clear the stored URLs so the "we keep only the result,
// never the document" promise is TRUE. Preserves classification/confidence/
// status; only the `documents` URLs (and the blobs themselves) are removed.
//
// NOT called while a verification is `pending` — an admin must still be able to
// view the document to make the manual call.

import { prisma, parseJSON, stringifyJSON } from "@/lib/db";
import { deleteUploadThingUrls } from "@/lib/uploadthing-server";

type StoredDoc = { url: string; label: string };

export async function purgeVerificationDocuments(pvId: string, rawDocuments: string): Promise<void> {
  const docs = parseJSON<StoredDoc[]>(rawDocuments, []);
  // Best-effort blob delete first (non-fatal), then blank the stored URLs so
  // nothing — DB row or CDN — retains the document after the decision.
  await deleteUploadThingUrls(docs.map((d) => d.url));
  await prisma.propertyVerification.update({
    where: { id: pvId },
    data: { documents: stringifyJSON([]) },
  });
}
