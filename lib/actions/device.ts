"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { describeDevice, DEVICE_COOKIE, DEVICE_DAYS } from "@/lib/device";

// Called right after the person enters their 2FA code. A random token goes into an httpOnly cookie, and only its
// hash goes to the database. The database refuses unless the session has just passed the code step.
export async function rememberThisDevice(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const userAgent = (await headers()).get("user-agent") ?? "";

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_trusted_device", {
    p_token_hash: hash,
    p_label: describeDevice(userAgent),
  });
  if (error)
    return {
      ok: false,
      error:
        error.code === "P0001"
          ? error.message
          : "Could not remember this device.",
    };

  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_DAYS * 24 * 60 * 60,
  });
  return { ok: true };
}

// Stop trusting one device from the list in Settings.
export async function revokeDevice(formData: FormData) {
  await requireRole(["admin", "doctor", "nurse", "receptionist", "patient"]);

  // Which Settings page to come back to (only the known ones are accepted).
  const back = z
    .enum([
      "/settings",
      "/doctor/settings",
      "/nurse/settings",
      "/reception/settings",
      "/admin/settings",
    ])
    .catch("/settings")
    .parse(formData.get("returnTo"));

  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success)
    redirect(`${back}?error=${encodeURIComponent("Invalid device.")}`);

  const supabase = await createClient();
  const { data: wasThisDevice, error } = await supabase.rpc(
    "revoke_trusted_device",
    { p_id: id.data },
  );
  if (error)
    redirect(
      `${back}?error=${encodeURIComponent("Could not remove that device.")}`,
    );

  // If it was this very browser, forget the cookie too.
  if (wasThisDevice === true) (await cookies()).delete(DEVICE_COOKIE);

  revalidatePath(back);
  redirect(
    `${back}?notice=${encodeURIComponent("Device removed. A code will be asked for there next time.")}`,
  );
}
