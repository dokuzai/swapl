import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in · swapl" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
