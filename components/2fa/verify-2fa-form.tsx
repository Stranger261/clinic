import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Notice } from "../ui";
import { buttonClass, inputClass } from "@/constants";

export default function Verify2faForm({ home }: { home: string }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      <button
        disabled={busy || !factorId || code.length !== 6}
        className={`${buttonClass()} w-full ${busy ? "cursor-wait opacity-70" : ""}`}
      >
        {busy ? "Checking..." : "Verify"}
      </button>
    </form>
  );
}
