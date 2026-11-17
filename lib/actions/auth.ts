"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { DEVICE_COOKIE } from "./device";

export const signOut = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
};

export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.rpc("revoke_all_trusted_devices");
  await supabase.auth.signOut({ scope: "global" });
  (await cookies()).delete(DEVICE_COOKIE);
  redirect("/login");
}
