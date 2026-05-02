import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import ForgotForm from "./forgot-form";

export const metadata = { title: "Forgot password · swapl" };

export default function ForgotPasswordPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1 grid place-items-center py-16 px-4">
        <ForgotForm />
      </main>
      <Footer />
    </>
  );
}
