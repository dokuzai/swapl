import { Suspense } from "react";
import LoginForm from "./login-form";
import { webAuthProviders } from "@/lib/auth/web-providers";

export const metadata = { title: "Sign in · swapl" };

export default function LoginPage() {
  // Server-side: read the same env the API routes gate on, so provider
  // buttons never appear (no markup, no third-party scripts) unless the
  // matching endpoint is configured. No client fetch → no flash.
  const providers = webAuthProviders();
  return (
    <Suspense>
      <LoginForm providers={providers} />
    </Suspense>
  );
}
