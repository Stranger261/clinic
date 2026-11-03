import Link from "next/link";
import GoogleButton from "@/components/google-button";
import Logo from "@/components/logo";
import SubmitButton from "@/components/submit-button";
import { Card, Notice } from "@/components/ui";
import { signInAsDemo } from "@/lib/actions/demo";
import { DEMO_LABELS, DEMO_ROLES, demoEnabled, demoOnly } from "@/lib/demo";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const demo = demoEnabled();
  const showGoogle = !demoOnly();

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md space-y-6">
        <Link href="/" aria-label="Back to the home page">
          <Logo />
        </Link>

        <Card className="space-y-6 p-8 mt-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
            <p className="mt-1 text-muted">
              Sign in to book and manage your appointments.
            </p>
          </div>

          {error && (
            <Notice kind="error">
              {error === "demo"
                ? "The demo is unavailable right now. Please try again later."
                : "Sign-in failed. Please try again."}
            </Notice>
          )}

          {demo && (
            <section className="space-y-3">
              <div>
                <h2 className="font-semibold">Try the demo</h2>
                <p className="text-sm text-muted">
                  No account needed. Pick a role to explore. All data is fake
                  and resets regularly.
                </p>
              </div>
              <div className="grid gap-2">
                {DEMO_ROLES.map((role) => (
                  <form key={role} action={signInAsDemo}>
                    <input type="hidden" name="role" value={role} />
                    <SubmitButton
                      raw
                      spinner={false}
                      className="w-full rounded-xl border border-line px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      <span className="font-semibold">
                        {DEMO_LABELS[role].title}
                      </span>
                      <span className="block text-sm text-muted">
                        {DEMO_LABELS[role].blurb}
                      </span>
                    </SubmitButton>
                  </form>
                ))}
              </div>
            </section>
          )}

          {showGoogle && (
            <section className="space-y-3">
              {demo && (
                <p className="text-sm text-muted">Or use your own account</p>
              )}
              <GoogleButton />
            </section>
          )}
        </Card>
      </div>
    </main>
  );
}
