import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import ListingForm from "./listing-form";

export const metadata = { title: "List your home · swapl" };
export const dynamic = "force-dynamic";

export default async function ListingNewPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/listings/new");
  return (
    <div className="wrap py-10 lg:py-14">
      <header className="mb-10 max-w-[640px]">
        <p className="kicker mb-3">List your home</p>
        <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
          Eight steps. Every detail counts.
        </h1>
        <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>
          The more precise you are, the better your matches will be. You can edit anything after publishing.
        </p>
      </header>
      <ListingForm />
    </div>
  );
}
