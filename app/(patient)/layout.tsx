import AppShell from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const links = [
  { href: "/book", label: "Book" },
  { href: "/appointments", label: "My appointments" },
  { href: "/profile", label: "Profile" },
];

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["patient"]);
  return (
    <AppShell title="Patient" name={profile.full_name} links={links}>
      {children}
    </AppShell>
  );
}
