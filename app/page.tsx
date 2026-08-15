import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/lib/auth/identity";

export default async function Home() {
  // Through the seam, not Supabase directly: this has to answer the same way whichever
  // identity provider is configured. See lib/auth/identity.ts.
  const user = await getCurrentIdentity();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
