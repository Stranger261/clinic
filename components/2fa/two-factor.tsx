import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { Notice } from "../ui";
import { buttonClass, inputClass } from "@/constants";

type Factor = { id: string; friendly_name?: string };
type Setup = { factorId: string; qr: string; secret: string };
type Message = { kind: "error" | "success"; text: string };

export default function TwoFactor({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().auth.mfa.listFactors();

    if (error) {
      console.error("Failed to load MFA factors:", error);
      return;
    }

    setFactors(data?.totp ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function start() {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.status === "unverified")
        await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator App",
    });
    if (!data || error) {
      setMessage({
        kind: "error",
        text: "Could not start the setup. Please try again.",
      });
    } else {
      setSetup({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    }
    setBusy(false);
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!setup || busy) return;
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({
      factorId: setup.factorId,
      code: code.trim(),
    });
    if (error) {
      setMessage({
        kind: "error",
        text: "That code did not work. Check your authenticator app and try again.",
      });
      setCode("");
      setBusy(false);
      return;
    }

    setSetup(null);
    setCode("");
    setMessage({
      kind: "success",
      text: "Two-step verification is on. You will be asked for a code when you sign in.",
    });

    await load();
    setBusy(false);
    router.refresh();
  }

  async function cancelSetup() {
    if (setup)
      await createClient().auth.mfa.unenroll({ factorId: setup.factorId });

    setSetup(null);
    setCode("");
    setMessage(null);
  }

  async function turnOff(factorId: string) {
    setBusy(true);
    const { error } = await createClient().auth.mfa.unenroll({ factorId });
    if (error) {
      setMessage({
        kind: "error",
        text: "Could not turn it off. Sign out, sign in again with your code, then try once more.",
      });
    } else {
      setMessage({ kind: "success", text: "Two-step verification is off." });
      await load();
      router.refresh();
    }
    setConfirmOff(false);
    setBusy(false);
  }

  if (disabled) {
    return (
      <Notice kind="info">
        Two-step verification is switched off in the demo, because everyone
        shares the demo accounts.
      </Notice>
    );
  }

  if (factors === null) return <p className="text-sm text-muted">Loading...</p>;

  const on = factors.length > 0;

  return (
    <div className="space-y-4">
      {message && (
        <div role="status">
          <Notice kind={message.kind}>{message.text}</Notice>
        </div>
      )}

      {!setup && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">
              Authenticator app{" "}
              <span
                className={`ml-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${on ? "bg-brand-100 text-brand-800" : "bg-slate-200 text-slate-700"}`}
              >
                {on ? "On" : "Off"}
              </span>
            </p>
            <p className="text-sm text-muted">
              {on
                ? "You enter a 6-digit code from your app each time you sign in."
                : "Use an app such as Google Authenticator, Microsoft Authenticator or 1Password to add a second step when you sign in."}
            </p>
          </div>
          {!on && (
            <button
              onClick={start}
              disabled={busy}
              className={`${buttonClass()} ${busy ? "cursor-wait opacity-70" : ""}`}
            >
              {busy ? "Starting..." : "Set up"}
            </button>
          )}
          {on && !confirmOff && (
            <button
              onClick={() => setConfirmOff(true)}
              className={buttonClass("danger", "sm")}
            >
              Turn off
            </button>
          )}
          {on && confirmOff && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Turn off two-step verification?</span>
              <button
                onClick={() => void turnOff(factors[0].id)}
                disabled={busy}
                className={`${buttonClass("danger", "sm")} ${busy ? "cursor-wait opacity-70" : ""}`}
              >
                {busy ? "Turning off..." : "Yes, turn off"}
              </button>
              <button
                onClick={() => setConfirmOff(false)}
                className={buttonClass("ghost", "sm")}
              >
                Keep it on
              </button>
            </div>
          )}
        </div>
      )}

      {setup && (
        <form onSubmit={confirmSetup} className="space-y-4">
          <ol className="list-decimal space-y-4 pl-5 text-sm">
            <li>
              Scan this code with your authenticator app.
              <div className="mt-2 inline-block rounded-xl border border-line bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setup.qr}
                  alt="QR code to add this account to your authenticator app"
                  width={176}
                  height={176}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                Cannot scan? Enter this key in the app instead:{" "}
                <span className="select-all break-all font-mono text-ink">
                  {setup.secret}
                </span>
              </p>
            </li>
            <li>
              Enter the 6-digit code the app shows.
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                required
                aria-label="6-digit code"
                className={`${inputClass} mt-2 block w-40 text-center text-lg tracking-widest`}
              />
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || code.length !== 6}
              className={`${buttonClass()} ${busy ? "cursor-wait opacity-70" : ""}`}
            >
              {busy ? "Checking..." : "Verify and turn on"}
            </button>
            <button
              type="button"
              onClick={() => void cancelSetup()}
              className={buttonClass("ghost")}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
