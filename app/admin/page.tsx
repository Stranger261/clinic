import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin" };

const items = [
  { href: "/admin/departments", title: "Departments", text: "Add the departments patients can choose from." },
  { href: "/admin/doctors", title: "Doctors", text: "Make a signed-up user a doctor and assign a department." },
  { href: "/admin/requests", title: "Reschedule requests", text: "Review urgent reschedule requests from patients." },
];

export default function AdminHome() {
  return (
    <>
      <PageHeader title="Admin dashboard" subtitle="Set up the clinic before doctors add their slots." />
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="group">
            <Card className="h-full transition group-hover:border-brand-300 group-hover:bg-brand-50">
              <p className="font-semibold">{i.title}</p>
              <p className="mt-1 text-sm text-muted">{i.text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
