import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import ForgotForm from "./forgot-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forgot password · swapl" };

export default function ForgotPasswordPage() {
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1 grid place-items-center py-16 px-4">
        <ForgotForm />
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
