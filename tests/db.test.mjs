// Database tests: runs every SQL file in supabase/ in order inside a real Postgres engine (PGlite),
// then checks booking, profiles, reschedules, roles and permissions.
// Setup once:   npm i -D @electric-sql/pglite
// Run:          node tests/db.test.mjs
// Note: this uses stand-ins for Supabase's sign-in tables, so it checks your SQL, not Supabase's own services.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import fs from "node:fs";

import { fileURLToPath } from "node:url";
const SQL_DIR = fileURLToPath(new URL("../supabase", import.meta.url));
const db = new PGlite({ extensions: { btree_gist } });
let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => { cond ? pass++ : fail++; console.log(cond ? "ok  " : "FAIL", label, cond ? "" : extra); };
const expectError = async (label, fn, includes) => {
  try { await fn(); ok(label, false, "no error was raised"); }
  catch (e) { const m = String(e.message ?? e); ok(label, includes ? m.includes(includes) : true, `got: ${m.slice(0, 140)}`); return e; }
};

// ---- stand-ins for what Supabase provides ----
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create publication supabase_realtime;
`);
// Supabase gives anon/authenticated broad default privileges on public tables; migrations then restrict via RLS and revokes.
await db.exec(`alter default privileges in schema public grant all on tables to anon, authenticated;
               alter default privileges in schema public grant all on sequences to anon, authenticated;`);

// ---- run every migration file, in order, one run each (like the SQL editor) ----
const files = ["schema.sql","002_profile_policy.sql","003_admin_management.sql","004_slots.sql","005_patient_booking.sql",
  "006_cancel_appointment.sql","007a_held_status.sql","007b_reschedule.sql","008_my_schedule.sql","009_visit_reason.sql",
  "010_demo.sql","011_calendar_realtime.sql","012_month_calendar.sql","013_patient_profiles.sql","014_visit_outcomes_and_patient_details.sql"];
for (const f of files) {
  try { await db.exec(fs.readFileSync(`${SQL_DIR}/${f}`, "utf8")); ok(`migration ${f}`, true); }
  catch (e) { ok(`migration ${f}`, false, String(e.message).slice(0, 300)); console.log("STOP: fix this file first"); process.exit(1); }
}

const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (id) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id ?? ""}', false); set role authenticated;`); };
const asAnon = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','', false); set role anon;`); };
const admin = async () => { await db.exec("reset role;"); };
const mkUser = async (email, name) => (await q("insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id", [email, JSON.stringify(name ? { full_name: name } : {})]))[0].id;

// ---- demo data ----
const dPatient = await mkUser("demo-patient@clinic.example");
const dDoctor  = await mkUser("demo-doctor@clinic.example");
const dAdmin   = await mkUser("demo-admin@clinic.example");
await q("select public.reset_demo_data()");
const prof = await q("select email, role, full_name from public.profiles order by email");
ok("demo roles set by reset", prof.find(p => p.email === "demo-admin@clinic.example")?.role === "admin" && prof.find(p => p.email === "demo-doctor@clinic.example")?.role === "doctor");
ok("demo patient profile is complete", (await q("select count(*)::int c from public.patient_profiles"))[0].c === 1);
const doctorId = (await q("select id from public.doctors limit 1"))[0].id;
ok("demo slots seeded", (await q("select count(*)::int c from public.slots where doctor_id=$1", [doctorId]))[0].c > 0);

// ---- patient basics ----
await as(dPatient);
ok("patient_profile_complete() true for demo patient", (await q("select public.patient_profile_complete() v"))[0].v === true);
const docs = await q("select * from public.list_doctors()");
ok("list_doctors returns the demo doctor", docs.length === 1 && docs[0].doctor_name === "Dr. Demo");
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const cal = await q("select * from public.calendar_slots($1, $2::date, 31)", [doctorId, today]);
ok("calendar_slots returns a month of slots (62-day clamp)", cal.length > 0);
const opens = cal.filter(s => s.slot_status === "open");
ok("some slots are open", opens.length > 3);

// patient can see slot status (011 policy) but not appointments or patient profiles directly
ok("patient can read slots (needed for realtime)", (await q("select count(*)::int c from public.slots"))[0].c > 0);
ok("patient cannot read appointments table directly", (await q("select count(*)::int c from public.appointments"))[0].c === 0);
ok("patient cannot read patient_profiles table directly", (await q("select count(*)::int c from public.patient_profiles"))[0].c === 0);
await expectError("patient cannot insert slots directly", () => q("insert into public.slots (doctor_id, starts_at, ends_at) values ($1, now() + interval '9 days', now() + interval '9 days 30 minutes')", [doctorId]), null);

// booking with a complete profile, then the same slot again
const target = opens[opens.length - 1];
await q("select public.book_slot($1, 'checkup', 'first visit')", [target.slot_id]);
ok("booking works with a complete profile", (await q("select slot_status from public.calendar_slots($1,$2::date,62) where slot_id=$3", [doctorId, today, target.slot_id]))[0].slot_status === "booked");
await expectError("booking the same slot again is refused", () => q("select public.book_slot($1, 'checkup', null)", [target.slot_id]), "already have an appointment");

// ---- a NEW patient without a profile (the gate) ----
await admin();
const newbie = await mkUser("new.patient@example.com", "New Patient");
await as(newbie);
ok("new patient profile is NOT complete", (await q("select public.patient_profile_complete() v"))[0].v === false);
const prefill = await q("select * from public.get_my_patient_profile()");
ok("form pre-fills the name from sign-in", prefill.length === 1 && prefill[0].full_name === "New Patient" && prefill[0].phone === null);
const e1 = await expectError("booking without a profile is refused with code PR001", () => q("select public.book_slot($1, 'checkup', null)", [opens[0].slot_id]), "complete your profile");
ok("the error carries the PR001 code the app looks for", e1?.code === "PR001", `code was ${e1?.code}`);
await as(newbie);
const save = (o = {}) => q(`select public.save_patient_profile($1,$2::date,$3::public.patient_sex,$4,$5,$6,$7,$8)`,
  [o.name ?? "New Patient", o.dob ?? "1995-03-02", o.sex ?? "female", o.phone ?? "0917 123 4567", o.address ?? "45 Example Road, Sample City",
   o.emName ?? "Parent Example", o.emPhone ?? "0917 765 4321", o.allergies ?? "Penicillin"]);
await expectError("future date of birth is rejected", () => save({ dob: "2999-01-01" }), "valid date of birth");
await expectError("date of birth over 120 years ago is rejected", () => save({ dob: "1800-01-01" }), "valid date of birth");
await expectError("bad mobile number is rejected", () => save({ phone: "abc" }), "valid mobile number");
await expectError("too few digits is rejected", () => save({ phone: "12345" }), "valid mobile number");
await expectError("same number for emergency contact is rejected", () => save({ emPhone: "(0917) 123-4567" }), "different number");
await expectError("one-letter name is rejected", () => save({ name: "A" }), "full name");
await expectError("short address is rejected", () => save({ address: "x" }), "address");
await expectError("long allergies are rejected", () => save({ allergies: "x".repeat(301) }), "300 characters");
ok("nothing was saved by the failed attempts", (await q("select public.patient_profile_complete() v"))[0].v === false);
await save();
ok("a valid profile saves and counts as complete", (await q("select public.patient_profile_complete() v"))[0].v === true);
await save({ phone: "0917 999 0000" });
ok("saving again updates the same profile", (await q("select phone from public.get_my_patient_profile()"))[0].phone === "0917 999 0000");
await q("select public.book_slot($1, 'new_concern', null)", [opens[1].slot_id]);
ok("the new patient can book once the profile is complete", (await q("select count(*)::int c from public.my_appointments()"))[0].c === 1);

// doctor cannot save a patient profile
await as(dDoctor);
await expectError("a doctor cannot save a patient profile", () => save(), "Only patients");

// ---- doctor view ----
const sched = await q("select * from public.my_schedule()");
const booked = sched.filter(s => s.slot_status === "booked");
ok("doctor sees patient names and reasons on booked slots", booked.some(s => s.patient_name === "Demo Patient") && booked.some(s => s.patient_name === "New Patient"));

// ---- cancel a far-away appointment ----
await as(dPatient);
const mine = await q("select * from public.my_appointments() where status = 'confirmed' order by slot_start desc");
const far = mine.find(a => new Date(a.slot_start).getTime() - Date.now() > 25 * 3600e3);
if (far) {
  await q("select public.cancel_appointment($1)", [far.appointment_id]);
  ok("cancelling a far-away appointment works", (await q("select status from public.my_appointments() where appointment_id=$1", [far.appointment_id]))[0].status === "cancelled");
  ok("the slot is open again", (await q("select slot_status from public.calendar_slots($1,$2::date,62) where slot_id=(select s.id from public.slots s where s.starts_at=$3::timestamptz and s.doctor_id=$1)", [doctorId, today, far.slot_start]))[0]?.slot_status === "open");
  await expectError("cancelling twice is refused", () => q("select public.cancel_appointment($1)", [far.appointment_id]), "already cancelled");
} else ok("(skipped) no far-away appointment to cancel", true);

// ---- emergency reschedule: held slot, approve, deny, withdraw ----
await admin();
const used = [];
const mkSlot = async (hoursAhead) => {
  // Pick a time outside the seeded 09:00-12:30 (Manila) window and at least 2 hours from our other test slots.
  let t = Date.now() + hoursAhead * 3600e3;
  const bad = (x) => { const h = new Date(x + 8 * 3600e3).getUTCHours(); return (h >= 8 && h <= 14) || used.some((u) => Math.abs(u - x) < 2 * 3600e3); };
  while (bad(t)) t += 3600e3;
  used.push(t);
  return (await q(`insert into public.slots (doctor_id, starts_at, ends_at) values ($1, $2::timestamptz, $2::timestamptz + interval '30 minutes') returning id`, [doctorId, new Date(t).toISOString()]))[0].id;
};
const slotStart = async (id) => { await admin(); return (await q("select starts_at from public.slots where id=$1", [id]))[0].starts_at; };
const nearId = await mkSlot(3), otherId = await mkSlot(40), other2 = await mkSlot(41);
await as(dPatient);
await q("select public.book_slot($1, 'follow_up', 'near')", [nearId]);
await expectError("cancelling inside 24 hours is refused", async () => { const a = (await q("select appointment_id from public.my_appointments() where slot_start < now() + interval '24 hours' and status='confirmed' limit 1"))[0]; await q("select public.cancel_appointment($1)", [a.appointment_id]); }, "24 hours");
const nearStart = await slotStart(nearId); await as(dPatient);
const apptNear = (await q("select appointment_id from public.my_appointments() where slot_start = $1::timestamptz", [nearStart]))[0].appointment_id;
await expectError("a reason shorter than 10 characters is refused", () => q("select public.request_reschedule($1,$2,'short')", [apptNear, otherId]), "10 characters");
await q("select public.request_reschedule($1,$2,'Family emergency at home')", [apptNear, otherId]);
ok("the requested slot is held", (await q("select slot_status from public.calendar_slots($1,$2::date,62) where slot_id=$3", [doctorId, today, otherId]))[0].slot_status === "held");
await expectError("a second pending request for the same appointment is refused", () => q("select public.request_reschedule($1,$2,'Another emergency')", [apptNear, other2]), "pending request");
await as(dDoctor);
const pend = await q("select * from public.pending_reschedule_requests()");
ok("the doctor sees the pending request", pend.length === 1 && pend[0].patient_name === "Demo Patient");
await q("select public.approve_reschedule($1)", [pend[0].request_id]);
await as(dPatient);
ok("approval moved the appointment to the new slot", (await q("select slot_start from public.my_appointments() where appointment_id=$1", [apptNear]))[0].slot_start !== undefined);
await admin();
ok("old slot is open and new slot is booked", (await q("select (select status from public.slots where id=$1) a, (select status from public.slots where id=$2) b", [nearId, otherId]))[0].a === "open" && (await q("select status from public.slots where id=$1", [otherId]))[0].status === "booked");

// deny path releases the hold
const near2 = await mkSlot(5);
await as(dPatient);
await q("select public.book_slot($1, 'checkup', null)", [near2]);
const near2Start = await slotStart(near2); await as(dPatient);
const apptNear2 = (await q("select appointment_id from public.my_appointments() where slot_start = $1::timestamptz", [near2Start]))[0].appointment_id;
await q("select public.request_reschedule($1,$2,'Need to move this one')", [apptNear2, other2]);
await as(dDoctor);
const p2 = (await q("select * from public.pending_reschedule_requests()"))[0];
await q("select public.deny_reschedule($1,'Please keep the time')", [p2.request_id]);
await admin();
ok("denying releases the held slot", (await q("select status from public.slots where id=$1", [other2]))[0].status === "open");
// withdraw path
await as(dPatient);
await q("select public.request_reschedule($1,$2,'Trying once more please')", [apptNear2, other2]);
const rid = (await q("select request_id from public.my_appointments() where request_id is not null and request_status='pending' limit 1"))[0].request_id;
await q("select public.withdraw_reschedule($1)", [rid]);
await admin();
ok("withdrawing releases the held slot", (await q("select status from public.slots where id=$1", [other2]))[0].status === "open");

// ---- doctor rules ----
await as(dDoctor);
await expectError("a slot closer than the 5-minute break is refused", async () => {
  const s = (await q("select slot_start from public.my_schedule() where slot_status='open' order by slot_start limit 1"))[0];
  const local = new Date(new Date(s.slot_start).getTime() + 8 * 3600e3 + 31 * 60e3).toISOString().slice(0, 16);
  await q("select public.add_slot($1::timestamp)", [local]);
}, "too close");
await expectError("a slot in the past is refused", () => q("select public.add_slot('2020-01-01 09:00')"), "future");
await admin();
const farSlot = await mkSlot(300);
await q("update public.slots set status='booked' where id=$1", [farSlot]);
await as(dDoctor);
await expectError("deleting a booked slot is blocked by row security", async () => { const r = await db.query("delete from public.slots where id=$1 returning id", [farSlot]); if (r.rows.length) throw new Error("deleted"); throw new Error("blocked: no rows deleted"); }, "blocked");

// ---- admin rules ----
await admin();
const doc2user = await mkUser("second.doctor@example.com", "Dr. Second");
await as(dAdmin);
const dept = (await q("select id from public.departments limit 1"))[0].id;
await q("select public.assign_doctor($1,$2)", [doc2user, dept]);
ok("admin can promote a patient to doctor", (await q("select count(*)::int c from public.doctors"))[0].c === 2);
await expectError("admin cannot promote a non-patient (the demo doctor)", () => q("select public.assign_doctor($1,$2)", [dDoctor, dept]), "not a patient");
await as(dPatient);
await expectError("a patient cannot assign doctors", () => q("select public.assign_doctor($1,$2)", [doc2user, dept]), "Only admins");

// ---- visit outcomes and patient details (014) ----
await admin();
const startedId = (await q("select s.id from public.slots s join public.appointments a on a.slot_id = s.id where s.doctor_id=$1 and s.starts_at < now() and a.patient_id=$2 limit 1", [doctorId, dPatient]))[0]?.id;
ok("the demo reset seeds a visit that has already started", Boolean(startedId));
const futureBooked = (await q("select s.id from public.slots s join public.appointments a on a.slot_id = s.id where s.doctor_id=$1 and s.starts_at > now() and a.status='confirmed' limit 1", [doctorId]))[0]?.id;
await as(dDoctor);
await expectError("outcome cannot be recorded before the visit starts", () => q("select public.set_visit_outcome($1,'completed')", [futureBooked]), "has started");
await as(dPatient);
await expectError("a patient cannot record an outcome", () => q("select public.set_visit_outcome($1,'completed')", [startedId]), "Only doctors");
await as(doc2user);
await expectError("another doctor cannot record the outcome (slot not theirs)", () => q("select public.set_visit_outcome($1,'completed')", [startedId]), "Slot not found");
await as(dDoctor);
await q("select public.set_visit_outcome($1,'completed')", [startedId]);
let row = (await q("select * from public.my_schedule() where slot_id=$1", [startedId]))[0];
ok("the outcome is recorded as completed", row.outcome === "completed");
await q("select public.set_visit_outcome($1,'no_show')", [startedId]);
row = (await q("select * from public.my_schedule() where slot_id=$1", [startedId]))[0];
ok("the outcome can be corrected to no-show", row.outcome === "no_show");
await expectError("an empty slot has no visit to close", async () => { await admin(); const e = await mkSlot(-6); await as(dDoctor); await q("select public.set_visit_outcome($1,'completed')", [e]); }, "no booked visit");
await as(dDoctor);
row = (await q("select * from public.my_schedule() where slot_id=$1", [startedId]))[0];
ok("doctor sees the patient's details on a booked slot", row.patient_name === "Demo Patient" && Number.isInteger(row.patient_age) && row.patient_age > 30 && row.patient_phone === "0900 000 0001" && row.emergency_name === "Sample Contact" && row.allergies === "None known" && row.patient_sex === "prefer_not_to_say");
const cols = Object.keys(row);
ok("the doctor does NOT get the address or exact date of birth", !cols.includes("address") && !cols.includes("date_of_birth") && !cols.includes("dob"));
await as(doc2user);
ok("a doctor with no slots sees no other doctor's patients", (await q("select count(*)::int c from public.my_schedule()"))[0].c === 0);
await as(dPatient);
const mineNow = await q("select * from public.my_appointments() where outcome is not null");
ok("the patient sees the outcome on the past visit", mineNow.length === 1 && mineNow[0].outcome === "no_show");
await expectError("a patient cannot cancel a visit that already started", () => q("select public.cancel_appointment($1)", [mineNow[0].appointment_id]), "24 hours");

// ---- grants: signed-out visitors cannot call functions ----
await asAnon();
await expectError("anon cannot call list_doctors", () => q("select * from public.list_doctors()"), "permission denied");
await expectError("anon cannot call book_slot", () => q("select public.book_slot(1,'checkup',null)"), "permission denied");

// ---- the demo reset repairs a visitor who tampered with it ----
await admin();
await q("update public.profiles set role='doctor' where id=$1", [dPatient]);
await q("update public.patient_profiles set phone='0000000' where profile_id=$1", [dPatient]).catch(() => {});
await q("select public.reset_demo_data()");
const rep = await q("select role from public.profiles where id=$1", [dPatient]);
ok("reset puts the demo patient back to patient", rep[0].role === "patient");
ok("reset restores the demo patient's profile", (await q("select phone from public.patient_profiles where profile_id=$1", [dPatient]))[0].phone === "0900 000 0001");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
