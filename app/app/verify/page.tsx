import { Suspense } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import VerifyResult from "./result";

// Mirror the rest of the auth-adjacent surfaces (forgot/reset-password):
// force-dynamic so Next 16's static prerender pass never tries to evaluate
// the client-only useSearchParams() in result.tsx — that path triggers
// "Expected workStore to be initialized" on Vercel's prerender workers.
export const dynamic = "force-dynamic";
export const metadata = { title: "Verify · swapl" };

export default function VerifyPage() {
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1 grid place-items-center py-16 px-4">
        <Suspense
          fallback={
            <div className="surface-card p-8 max-w-md text-center">
              <p>Checking your link…</p>
            </div>
          }
        >
          <VerifyResult />
        </Suspense>
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
