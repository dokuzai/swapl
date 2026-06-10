import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// The app root is pure product: signed-in members land on their dashboard,
// everyone else goes straight to the browse experience. The marketing home
// lives on the marketing site (swapl.fun).
export default async function RootPage() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/listings");
}
