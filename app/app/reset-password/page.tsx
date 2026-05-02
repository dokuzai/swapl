import { Suspense } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import ResetForm from "./reset-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password · swapl" };

export default function ResetPasswordPage() {
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1 grid place-items-center py-16 px-4">
        <Suspense fallback={<div className="surface-card p-8 max-w-md">Loading…</div>}>
          <ResetForm />
        </Suspense>
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
