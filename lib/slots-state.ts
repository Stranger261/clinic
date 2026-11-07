import { dayKey } from "@/lib/clinic";

// The calendars keep their own copy of the slots in the browser and patch it when a live change arrives.
// Everything here is plain functions, so it is easy to test.

export type SlotStatus = "open" | "booked" | "held" | "blocked";

export type CalSlot = {
  slot_id: number;
  slot_start: string;
  slot_end: string;
  slot_status: SlotStatus;
};

export const toMap = <T extends { slot_id: number }>(rows: T[]) =>
  new Map<number, T>(rows.map((r) => [r.slot_id, r] as [number, T]));

// How many slots are open, and how many there are in total, for each clinic-local day.
export function dayStats(
  slots: Iterable<{ slot_start: string; slot_status: string }>,
) {
  const stats = new Map<string, { open: number; total: number }>();
  for (const s of slots) {
    const key = dayKey(s.slot_start);
    const cur = stats.get(key) ?? { open: 0, total: 0 };
    cur.total += 1;
    if (s.slot_status === "open") cur.open += 1;
    stats.set(key, cur);
  }
  return stats;
}

export type Tone = "none" | "full" | "plenty" | "some" | "few";

// Green when half or more are open, yellow from a fifth to just under half, red below that.
export function tone(open: number, total: number): Tone {
  if (total === 0) return "none";
  if (open === 0) return "full";
  const ratio = open / total;
  return ratio >= 0.5 ? "plenty" : ratio >= 0.2 ? "some" : "few";
}

// The shape of a Supabase Realtime Postgres Changes event, reduced to what we use.
export type SlotChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

// Applies one live change to the local copy. This only updates what is on screen:
// the database still decides who actually gets a slot.
export function applyChange(
  current: Map<number, CalSlot>,
  change: SlotChange,
  range: { from: string; to: string },
  nowMs: number,
): Map<number, CalSlot> {
  const next = new Map(current);

  if (change.eventType === "DELETE") {
    // A delete event only carries the id, so that is all we can use.
    next.delete(Number(change.old.id));
    return next;
  }

  const row = change.new;
  const id = Number(row.id);
  const start = String(row.starts_at);
  if (!Number.isFinite(id) || Number.isNaN(Date.parse(start))) return current;

  // Outside the month on screen, or already started: make sure it is not shown.
  const day = dayKey(start);
  if (day < range.from || day > range.to || Date.parse(start) <= nowMs) {
    next.delete(id);
    return next;
  }

  next.set(id, {
    slot_id: id,
    slot_start: start,
    slot_end: String(row.ends_at),
    slot_status: row.status as SlotStatus,
  });
  return next;
}

// True when a slot that was open is now taken (or held or blocked) and it is on the given day.
// The patient calendar uses this to tell the person looking at that day, "this time was just taken".
export function justBecameUnavailable(
  before: Map<number, CalSlot>,
  after: Map<number, CalSlot>,
  id: number,
  day: string,
) {
  const was = before.get(id);
  const now = after.get(id);
  return Boolean(
    was &&
    now &&
    was.slot_status === "open" &&
    now.slot_status !== "open" &&
    dayKey(now.slot_start) === day,
  );
}
