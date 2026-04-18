import { z } from "zod";
import { PROVINCE_CODES, type ProvinceCode } from "@/lib/constants/provinces";

export const postalCodeRegex =
  /^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z] ?[0-9][ABCEGHJ-NPRSTV-Z][0-9]$/i;

// Lenient NANP: allow leading +1 and any common separators, but insist on 10 digits.
export const phoneRegex =
  /^\+?1?[\s.-]*\(?([2-9][0-9]{2})\)?[\s.-]*([2-9][0-9]{2})[\s.-]*([0-9]{4})$/;

export function normalizePhone(raw: string): string {
  const m = raw.match(phoneRegex);
  if (!m) return raw;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

const provinceSchema = z.enum(PROVINCE_CODES as [ProvinceCode, ...ProvinceCode[]]);

const optionalCoercedNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().optional(),
);

const optionalString = z
  .string()
  .transform((v) => (v.trim() === "" ? undefined : v.trim()))
  .optional();

const phoneSchema = z
  .string()
  .refine((v) => phoneRegex.test(v), { message: "Invalid phone number" })
  .transform(normalizePhone);

const postalCodeSchema = z
  .string()
  .refine((v) => postalCodeRegex.test(v), { message: "Invalid Canadian postal code" })
  .transform((v) =>
    v
      .toUpperCase()
      .replace(/\s+/, " ")
      .replace(/^(.{3})(.{3})$/, "$1 $2"),
  );

const baseShape = {
  first_name: z.string().trim().min(1, "Required"),
  last_name: z.string().trim().min(1, "Required"),
  phone: phoneSchema,
  email: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Invalid email",
    })
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  address_line1: z.string().trim().min(1, "Required"),
  address_line2: optionalString,
  city: z.string().trim().min(1, "Required"),
  province: provinceSchema,
  postal_code: postalCodeSchema,
  notes: optionalString,
};

export const seniorCreateSchema = z.object(baseShape);
export const seniorUpdateSchema = z.object({
  ...baseShape,
  manual_pin_override: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => v === true || v === "true"),
  lat: optionalCoercedNumber,
  lng: optionalCoercedNumber,
});

// CSV rows permit blank optional fields but otherwise match create.
export const seniorRowSchema = z.object(baseShape);

export type SeniorCreateInput = z.infer<typeof seniorCreateSchema>;
export type SeniorUpdateInput = z.infer<typeof seniorUpdateSchema>;
export type SeniorRowInput = z.infer<typeof seniorRowSchema>;
