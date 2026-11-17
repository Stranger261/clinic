import { createHash, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { createClient } from "./supabase/server";
import { describeDevice, DEVICE_COOKIE, DEVICE_DAYS } from "./actions/device";
import { requireRole } from "./auth";
import z from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function rememberThisDevice(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const userAgent = (await headers()).get("user-agent") ?? "";

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_trusted_device", {
    p_hash_token: hash,
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

export async function revokeDevice(formData: FormData) {
  await requireRole(["admin", "patient", "doctor"]);

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success)
    redirect(`/settings?error=${encodeURIComponent("Invalid Device")}`);

  const supabase = await createClient();
  const { data: wasThisDevice, error } = await supabase.rpc(
    "revoke_trusted_device",
    { p_id: id.data },
  );
  if (error)
    redirect(
      `/settings?error=${encodeURIComponent("Could not remove that device.")}`,
    );

  if (wasThisDevice === true) (await cookies()).delete(DEVICE_COOKIE);

  revalidatePath("/settings");
  redirect(
    `/settings?notice=${encodeURIComponent("Device removed. A code will be asked for there next time.")}`,
  );
}
