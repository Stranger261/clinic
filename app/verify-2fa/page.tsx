import Link from "next/link";
import { redirect } from "next/navigation";
import Logo from "@/components/logo";
import SubmitButton from "@/components/submit-button";
import { Card } from "@/components/ui";
import { signOut } from "@/lib/actions/auth";
import { getProfile, homeFor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Verify2faForm from "@/components/2fa/verify-2fa-form";

export const metadata = { title: "Two-step verification" };

export default async function Verify2faPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Already verified (or no 2FA turned on): nothing to do here.
  const supabase = await createClient();
  const { data: satisfied } = await supabase.rpc("mfa_satisfied");
  const home = homeFor(profile.role);
  if (satisfied !== false) redirect(home);

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md space-y-6">
        <Link href="/" aria-label="Back to the home page">
          <Logo />
        </Link>
        <Card className="space-y-5 p-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Two-step verification
            </h1>
            <p className="mt-1 text-muted">
              Open your authenticator app and enter the 6-digit code for this
              account.
            </p>
          </div>
          <Verify2faForm home={home} />
          <form action={signOut}>
            <SubmitButton
              variant="ghost"
              size="sm"
              pendingLabel="Signing out..."
              className="w-full"
            >
              Sign out
            </SubmitButton>
          </form>
        </Card>
      </div>
    </main>
  );
}
