"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/constants/ui";

export default function GoogleButton() {
  const [pending, setPending] = useState(false);

  async function signInWithGoogle() {
    if (pending) return;
    setPending(true);
    const supabase = createClient();
    console.log("lpogging in");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    console.log(error);
    // On success the browser leaves this page. If it failed, allow another try.
    if (error) setPending(false);
  }

  return (
    <button
      onClick={signInWithGoogle}
      disabled={pending}
      aria-disabled={pending}
      className={`${buttonClass("secondary")} w-full ${pending ? "cursor-wait opacity-70" : ""}`}
    >
      {pending ? "Redirecting to Google..." : "Continue with Google"}
    </button>
  );
}
