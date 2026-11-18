export const DEMO_ROLES = [
  "patient",
  "doctor",
  "admin",
  "nurse",
  "receptionist",
] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export const DEMO_EMAILS: Record<DemoRole, string> = {
  patient: "demo-patient@clinic.example",
  doctor: "demo-doctor@clinic.example",
  nurse: "demo-nurse@clinic.example",
  receptionist: "demo-receptionist@clinic.example",
  admin: "demo-admin@clinic.example",
};

export const DEMO_HOME: Record<DemoRole, string> = {
  patient: "/dashboard",
  doctor: "/doctor",
  nurse: "/nurse",
  receptionist: "/reception",
  admin: "/admin",
};

export const DEMO_LABELS: Record<DemoRole, { title: string; blurb: string }> = {
  patient: {
    title: "Patient",
    blurb: "Find a slot, book it, and request an emergency reschedule.",
  },
  doctor: {
    title: "Doctor",
    blurb: "Manage slots, see who booked, and record how visits went.",
  },
  nurse: {
    title: "Nurse",
    blurb: "See who has arrived and is waiting for vitals.",
  },
  receptionist: {
    title: "Receptionist",
    blurb: "See today's appointments and check patients in.",
  },
  admin: {
    title: "Admin",
    blurb: "Set up departments, doctors and other staff.",
  },
};

export const demoEnabled = () => process.env.DEMO_MODE === "true";
export const demoOnly = () => demoEnabled() && process.env.DEMO_ONLY === "true";

export const demoPassword = (role: DemoRole) =>
  ({
    patient: process.env.DEMO_PATIENT_PASSWORD,
    doctor: process.env.DEMO_DOCTOR_PASSWORD,
    nurse: process.env.DEMO_NURSE_PASSWORD,
    receptionist: process.env.DEMO_RECEPTIONIST_PASSWORD,
    admin: process.env.DEMO_ADMIN_PASSWORD,
  })[role];
