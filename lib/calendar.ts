import { dayKey, nowIso } from "@/lib/clinic";

// Date helpers for the calendars. Dates are plain 'YYYY-MM-DD' strings (clinic-local days) and
// months are 'YYYY-MM'. The arithmetic is done in UTC so it never shifts with the visitor's time zone.

export const isDateKey = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const isMonthKey = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- weeks ----------

// The Monday of the week that contains this date.
export function weekStart(date: string) {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}

export const weekDays = (start: string) =>
  Array.from({ length: 7 }, (_, i) => addDays(start, i));

// Turns the ?week= value from the URL into a safe week: never in the past, at most 8 weeks ahead.
export function resolveWeek(requested?: string) {
  const min = weekStart(dayKey(nowIso()));
  const max = addDays(min, 7 * 8);
  const wanted = isDateKey(requested) ? weekStart(requested) : min;
  const week = wanted < min ? min : wanted > max ? max : wanted;
  return { week, min, max };
}

// ---------- months ----------

export const monthOf = (date: string) => date.slice(0, 7);
export const firstOfMonth = (month: string) => `${month}-01`;

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const lastOfMonth = (month: string) =>
  `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;

// The cells of a Monday-first month grid: blanks (null) before the 1st, then every day.
export function monthCells(month: string): (string | null)[] {
  const first = firstOfMonth(month);
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  return [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth(month) }, (_, i) => addDays(first, i)),
  ];
}

// Turns ?month= (or ?date=) from the URL into a safe month: at most monthsBack in the past, 6 months ahead.
export function resolveMonth(
  requestedMonth?: string,
  requestedDate?: string,
  monthsBack = 0,
) {
  const current = monthOf(dayKey(nowIso()));
  const min = addMonths(current, -monthsBack);
  const max = addMonths(current, 6);
  const wanted = isMonthKey(requestedMonth)
    ? requestedMonth
    : isDateKey(requestedDate)
      ? monthOf(requestedDate)
      : current;
  const month = wanted < min ? min : wanted > max ? max : wanted;
  return { month, min, max, current };
}

// ---------- labels ----------

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", ...options });
const weekdayFormat = fmt({ weekday: "short" });
const dayNumberFormat = fmt({ day: "numeric" });
const monthDayFormat = fmt({ month: "short", day: "numeric" });
const monthYearFormat = fmt({ month: "long", year: "numeric" });
const at = (date: string) => new Date(`${date}T00:00:00Z`);

export const weekdayShort = (date: string) => weekdayFormat.format(at(date));
export const dayNumber = (date: string) => dayNumberFormat.format(at(date));
export const formatRange = (start: string) =>
  `${monthDayFormat.format(at(start))} to ${monthDayFormat.format(at(addDays(start, 6)))}`;
export const formatMonth = (month: string) =>
  monthYearFormat.format(at(firstOfMonth(month)));
