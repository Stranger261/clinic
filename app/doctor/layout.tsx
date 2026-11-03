import AppShell from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const links = [
  { href: "/doctor", label: "Schedule" },
  { href: "/doctor/requests", label: "Reschedule requests" },
];

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["doctor"]);
  return (
    <AppShell title="Doctor" name={profile.full_name} links={links}>
      {children}
    </AppShell>
  );
}
