import AppShell from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/departments", label: "Departments" },
  { href: "/admin/doctors", label: "Doctors" },
  { href: "/admin/requests", label: "Reschedule requests" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin"]);
  return (
    <AppShell title="Admin" name={profile.full_name} links={links}>
      {children}
    </AppShell>
  );
}
