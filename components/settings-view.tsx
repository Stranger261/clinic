import SubmitButton from "@/components/submit-button";
import TwoFactor from "@/components/2fa/two-factor";
import { Card, Messages, Notice, PageHeader } from "@/components/ui";
import { revokeDevice } from "@/lib/actions/device";
import { signOutEverywhere } from "@/lib/actions/auth";
import { getProfile } from "@/lib/auth";
import { formatDay } from "@/lib/clinic";
import { DEMO_EMAILS, demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

type Device = {
  id: string;
  label: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
};

// The Settings screen, shared by every role. basePath is where the page lives (so actions can come back to it).
export default async function SettingsView({
  basePath,
  searchParams,
}: {
  basePath: string;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { notice, error } = await searchParams;
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
  const devices = isDemo
    ? []
    : (((await supabase.rpc("list_trusted_devices")).data ?? []) as Device[]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        subtitle="How you sign in, and how to keep your account safe."
      />
      <Messages error={error} notice={notice} />

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

      {!isDemo && (
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Remembered devices</h2>
            <p className="text-sm text-muted">
              Browsers where you chose to skip the code for 30 days. Remove any
              you no longer use or do not recognise.
            </p>
          </div>
          {devices.length === 0 ? (
            <p className="text-sm text-muted">
              None. When you enter your code at sign-in, you can choose
              &quot;Remember this device&quot;.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div>
                    <p className="font-medium">
                      {d.label}
                      {d.is_current && (
                        <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      Added {formatDay(d.created_at)}. Expires{" "}
                      {formatDay(d.expires_at)}.
                    </p>
                  </div>
                  <form action={revokeDevice}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="returnTo" value={basePath} />
                    <SubmitButton
                      variant="danger"
                      size="sm"
                      pendingLabel="Removing..."
                    >
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Sign out everywhere</h2>
        {isDemo ? (
          <Notice kind="info">
            Signing out of every device is switched off for the shared demo
            accounts.
          </Notice>
        ) : (
          <>
            <p className="text-sm text-muted">
              Signed in on a device you no longer use? This signs you out
              everywhere, including here, and forgets every remembered device. A
              device can keep working for a short while (up to the session
              length) before it is fully locked out.
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
