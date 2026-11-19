import AppShell from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const links = [
  { href: "/reception", label: "Today" },
  { href: "/reception/settings", label: "Settings" },
];

export default async function ReceptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["receptionist"]);
  return (
    <AppShell title="Reception" name={profile.full_name} links={links}>
      {children}
    </AppShell>
  );
}
