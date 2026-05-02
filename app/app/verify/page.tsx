import Link from "next/link";
import { Suspense } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import VerifyResult from "./result";

export const metadata = { title: "Verify · swapl" };

export default function VerifyPage() {
  return (
    <>
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
    </>
  );
}
