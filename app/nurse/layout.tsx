import AppShell from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const links = [{ href: "/nurse", label: "Waiting for vitals" }];

export default async function NurseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["nurse"]);
  return (
    <AppShell title="Nurse" name={profile.full_name} links={links}>
      {children}
    </AppShell>
  );
}
