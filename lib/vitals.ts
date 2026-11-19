import z from "zod";

const field = (message: string, min: number, max: number, whole = true) =>
  z
    .string()
    .trim()
    .min(1, message)
    .transform((v) => Number(v))
    .pipe(z.number({ message }).min(min, message).max(max, message))
    .refine((v) => !whole || Number.isInteger(v), message);

export const vitalsSchema = z
  .object({
    visitId: z.coerce.number().int().positive(),
    systolic: field(
      "Please check the top blood pressure number (50 to 260).",
      50,
      260,
    ),
    diastolic: field(
      "Please check the bottom blood pressure number (30 to 160).",
      30,
      160,
    ),
    pulse: field(
      "Please check the pulse (20 to 250 beats per minute).",
      20,
      250,
    ),
    temperature: field(
      "Please check the temperature (30 to 45 degrees C).",
      30,
      45,
      false,
    ),
    respRate: field(
      "Please check the breathing rate (4 to 80 breaths per minute).",
      4,
      80,
    ),
    spo2: field("Please check the oxygen level (50 to 100 percent).", 50, 100),
    weight: field("Please check the weight (1 to 400 kg).", 1, 400, false),
    height: field("Please check the height (30 to 250 cm).", 30, 250, false),
    pain: field("Please check the pain score (0 to 10).", 0, 10),
  })
  .refine((v) => v.systolic > v.diastolic, {
    message:
      "The top blood pressure number must be higher than the bottom one.",
    path: ["diastolic"],
  });

export const VITAL_FIELDS = [
  "visitId",
  "systolic",
  "diastolic",
  "pulse",
  "temperature",
  "respRate",
  "spo2",
  "weight",
  "height",
  "pain",
] as const;

export const bmi = (kg: number, cm: number) =>
  Math.round((kg / (cm / 100) ** 2) * 10) / 10;
