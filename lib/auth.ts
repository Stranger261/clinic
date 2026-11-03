import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "doctor" | "patient";
export type Profile = { id: string; full_name: string; role: Role };

// The signed-in user's profile, or null when nobody is signed in.
export const getProfile = async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .single();

  return (profile as Profile | null) ?? null;
};

// Call at the top of any protected layout or page.
export const requireRole = async (allowed: Role[]): Promise<Profile> => {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!allowed.includes(profile.role)) redirect("/");
  return profile;
};
