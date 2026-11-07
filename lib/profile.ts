import { z } from "zod";
import { dayKey, nowIso } from "@/lib/clinic";
import { Sex, SEX_OPTIONS } from "@/constants";

const digits = (v: string) => v.replace(/[^0-9]/g, "");

const phoneField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^[0-9+() -]+$/, `Please enter a valid ${label}.`)
    .refine(
      (v) => digits(v).length >= 7 && digits(v).length <= 15,
      `Please enter a valid ${label}.`,
    );

// These checks give friendly messages quickly. The database repeats them, because it has the final say.
export const profileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Please enter your full name.")
      .max(100, "Please keep your name under 100 characters."),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter your date of birth.")
      .refine(
        (v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)),
        "Please enter a valid date of birth.",
      ),
    sex: z.enum(Object.keys(SEX_OPTIONS) as [Sex, ...Sex[]], {
      message: "Please choose an option for sex.",
    }),
    phone: phoneField("mobile number"),
    address: z
      .string()
      .trim()
      .min(5, "Please enter your address.")
      .max(200, "Please keep your address under 200 characters."),
    emergencyName: z
      .string()
      .trim()
      .min(2, "Please enter the name of your emergency contact.")
      .max(100, "Please keep the name under 100 characters."),
    emergencyPhone: phoneField("emergency contact number"),
    allergies: z
      .string()
      .trim()
      .max(300, "Please keep allergies under 300 characters."),
  })
  .superRefine((v, ctx) => {
    const today = dayKey(nowIso());
    const oldest = `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`;
    if (v.dateOfBirth > today || v.dateOfBirth < oldest) {
      ctx.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "Please enter a valid date of birth.",
      });
    }
    if (digits(v.phone) === digits(v.emergencyPhone)) {
      ctx.addIssue({
        code: "custom",
        path: ["emergencyPhone"],
        message:
          "The emergency contact needs a different number from your own.",
      });
    }
  });

// After saving the profile we may send the patient back to where they were. That address comes from the URL,
// so only the clinic's own booking pages are accepted. Anything else (another site, another path) is refused.
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  )
    return null;
  const path = value.split("?")[0];
  return ["/book", "/book/confirm", "/appointments"].includes(path)
    ? value
    : null;
}
