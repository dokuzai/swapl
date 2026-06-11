import { Suspense } from "react";
import RegisterForm from "./register-form";
import { webAuthProviders } from "@/lib/auth/web-providers";

export const metadata = { title: "Sign up · swapl" };

export default function RegisterPage() {
  // Same env-gated provider detection as /login (see that page for details).
  // Suspense: AuthProviders reads useSearchParams for the `next` redirect.
  const providers = webAuthProviders();
  return (
    <Suspense>
      <RegisterForm providers={providers} />
    </Suspense>
  );
}
