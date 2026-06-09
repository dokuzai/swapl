// Server component that resolves locale + dict and mounts the client
// LocaleProvider. Lives in section-level layouts (not the root layout) so
// Next's prerender of /_global-error and other layout-less internal routes
// never has to evaluate cookies()/headers() and crash with InvariantError.

import { getI18n } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";

export async function I18nProviderShell({ children }: { children: React.ReactNode }) {
  const { locale, dict } = await getI18n();
  return (
    <LocaleProvider locale={locale} dict={dict}>
      {children}
    </LocaleProvider>
  );
}
