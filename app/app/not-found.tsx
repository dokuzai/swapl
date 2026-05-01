import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="flex-1 grid place-items-center py-24 px-6 text-center">
        <div>
          <p className="kicker mb-3">404</p>
          <h1 className="font-display text-5xl tracking-[-0.02em] font-medium mb-4">No swap here yet.</h1>
          <p className="mb-6 max-w-md mx-auto" style={{ color: "var(--navy-2)" }}>
            That listing may have been removed or never existed. Try browsing what&rsquo;s currently available.
          </p>
          <Link href="/listings" className="pill-primary">Browse homes</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
