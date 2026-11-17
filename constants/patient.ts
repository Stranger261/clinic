export type Appointment = {
  appointment_id: number;
  status: "confirmed" | "cancelled";
  slot_start: string;
  slot_end: string;
  doctor_name: string;
  department_name: string;
  visit_reason: string | null;
  outcome: "completed" | "no_show" | null;
};

export type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  patient_no: number | null;
};

export const patientNumber = (n: number) => `P-${String(n).padStart(6, "0")}`;

export const quickActions = [
  {
    href: "/book",
    title: "Book an appointment",
    text: "Choose a doctor, a day and a time.",
  },
  {
    href: "/appointments",
    title: "My appointments",
    text: "View, cancel or ask to reschedule.",
  },
  {
    href: "/profile",
    title: "My details",
    text: "Keep your contact details up to date.",
  },
  {
    href: "/settings",
    title: "Settings",
    text: "Two-step verification and signing out.",
  },
];
