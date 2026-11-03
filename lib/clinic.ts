export const CLINIC_TIME_ZONE = "Asia/Manila";
export const SLOT_MINUTES = 30;
export const BREAK_MINUTES = 5;
export const CANCEL_NOTICE_HOURS = 24;

export const VISIT_REASONS = {
  checkup: "Check-up",
  follow_up: "Follow-up",
  new_concern: "New concern",
  other: "Other",
} as const;
export type VisitReason = keyof typeof VISIT_REASONS;
export const NOTE_MAX_LENGTH = 150;

export const reasonLabel = (reason: string | null) =>
  reason && reason in VISIT_REASONS
    ? VISIT_REASONS[reason as VisitReason]
    : "No reason given";

const dayFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: CLINIC_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: CLINIC_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const keyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIME_ZONE,
});

const dateOnlyFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});

export const formatDay = (iso: string) => dayFormat.format(new Date(iso));
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
export const dayKey = (iso: string) => keyFormat.format(new Date(iso));
export const formatDateOnly = (date: string) =>
  dateOnlyFormat.format(new Date(`${date}T00:00:00Z`));

export const nowIso = () => new Date().toISOString();
