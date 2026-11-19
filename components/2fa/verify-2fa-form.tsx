import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Notice } from "../ui";
import { buttonClass, inputClass } from "@/constants";
import { rememberThisDevice } from "@/lib/actions/device";

export default function Verify2faForm({ home }: { home: string }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => setFactorId(data?.totp[0]?.id ?? null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || busy) return;
    setBusy(true);
    setError("");
    const { error: verifyError } =
      await createClient().auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
    if (verifyError) {
      setError(
        "That code did not work. Check your authenticator app and try again.",
      );
      setCode("");
      setBusy(false);
      return;
    }
    if (remember) await rememberThisDevice();

    router.replace(home);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div role="alert">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <label className="block text-sm font-medium">
        <span className="mb-1.5 block">6-digit code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          required
          autoFocus
          className={`${inputClass} block w-full text-center text-lg tracking-widest`}
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span>
          Remember this device for 30 days
          <span className="block text-xs text-muted">
            Only on your own phone or computer. You will not be asked for a code
            here until then.
          </span>
        </span>
      </label>
      <button
        disabled={busy || !factorId || code.length !== 6}
        className={`${buttonClass()} w-full ${busy ? "cursor-wait opacity-70" : ""}`}
      >
        {busy ? "Checking..." : "Verify"}
      </button>
    </form>
  );
}
