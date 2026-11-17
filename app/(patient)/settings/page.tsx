import TwoFactor from "@/components/2fa/two-factor";
import SubmitButton from "@/components/submit-button";
import { Card, Notice, PageHeader } from "@/components/ui";
import { signOutEverywhere } from "@/lib/actions/auth";
import { getProfile } from "@/lib/auth";
import { DEMO_EMAILS, demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", me?.id ?? "")
    .single();
  const email = (data as { email: string | null } | null)?.email ?? "";

  // The demo accounts are shared by every visitor, so settings that affect the whole account are off for them.
  const isDemo =
    demoEnabled() && (Object.values(DEMO_EMAILS) as string[]).includes(email);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        subtitle="How you sign in, and how to keep your account safe."
      />

      <Card className="space-y-2">
        <h2 className="font-semibold">Sign-in</h2>
        <p className="text-sm">
          {isDemo ? (
            "You are using a shared demo account."
          ) : (
            <>
              You sign in with Google as{" "}
              <span className="font-medium">{email}</span>.
            </>
          )}
        </p>
        {!isDemo && (
          <p className="text-sm text-muted">
            Google looks after your password, so there is nothing to change
            here. To change your Google password or its security settings,{" "}
            <a
              href="https://myaccount.google.com/security"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-700 underline"
            >
              open your Google account
            </a>
            .
          </p>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Two-step verification</h2>
          <p className="text-sm text-muted">
            An extra code after you sign in, because your account holds personal
            health details.
          </p>
        </div>
        <TwoFactor disabled={isDemo} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Devices</h2>
        {isDemo ? (
          <Notice kind="info">
            Signing out of every device is switched off for the shared demo
            accounts.
          </Notice>
        ) : (
          <>
            <p className="text-sm text-muted">
              Signed in on a device you no longer use? This signs you out
              everywhere, including here. A device can keep working for a short
              while (up to the session length) before it is fully locked out.
            </p>
            <form action={signOutEverywhere}>
              <SubmitButton variant="danger" pendingLabel="Signing out...">
                Sign out of all devices
              </SubmitButton>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
