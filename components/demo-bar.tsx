import SubmitButton from "@/components/submit-button";
import { signInAsDemo } from "@/lib/actions/demo";
import { DEMO_ROLES, demoEnabled } from "@/lib/demo";

// A thin bar shown only in demo mode, so visitors can hop between roles.
export default function DemoBar() {
  if (!demoEnabled()) return null;

  return (
    <div className="border-b border-brand-200 bg-brand-50 px-5 py-2 text-sm text-brand-800">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className="font-semibold">Demo mode</span>
        <span className="text-brand-700">fake data. Switch role:</span>
        {DEMO_ROLES.map((role) => (
          <form key={role} action={signInAsDemo}>
            <input type="hidden" name="role" value={role} />
            <SubmitButton
              raw
              spinner={false}
              className="min-h-8 rounded-full border border-brand-300 bg-white px-3 py-0.5 text-xs font-semibold capitalize text-brand-800 transition hover:bg-brand-100"
            >
              {role}
            </SubmitButton>
          </form>
        ))}
      </div>
    </div>
  );
}
