import { SlotStatus, Tone } from "@/lib/slots-state";

export type DoctorSlot = {
  slot_id: number;
  slot_start: string;
  slot_end: string;
  slot_status: SlotStatus;
  patient_name: string | null;
  reschedule_pending: boolean;
  visit_reason: string | null;
  visit_note: string | null;
  outcome: "completed" | "no_show" | null;
  patient_age: number | null;
  patient_sex: string | null;
  patient_phone: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  allergies: string | null;
};

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const toneClass: Record<Tone, string> = {
  plenty: "border-green-200 bg-green-50 text-green-900 hover:bg-green-100",
  some: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
  few: "border-red-200 bg-red-50 text-red-900 hover:bg-red-100",
  full: "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200",
  none: "border-transparent text-slate-300",
};

export const legend = [
  { label: "Plenty open", swatch: "bg-green-100 border-green-300" },
  { label: "Filling up", swatch: "bg-amber-100 border-amber-300" },
  { label: "Almost full", swatch: "bg-red-100 border-red-300" },
  { label: "Full", swatch: "bg-slate-100 border-slate-300" },
];
