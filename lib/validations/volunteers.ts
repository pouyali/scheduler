import { z } from "zod";

// FormData.get() returns null for absent fields, so preprocess null → "" for string inputs.
const requiredString = (field: string) =>
  z.preprocess(
    (v) => (v === null || v === undefined ? "" : v),
    z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, { message: `${field} is required` }),
  );

const optionalString = z.preprocess(
  (v) => (v === null || v === undefined ? "" : v),
  z
    .string()
    .transform((v) => (v.trim() === "" ? undefined : v.trim()))
    .optional(),
);

const optionalCoercedNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().optional(),
);

const categoriesSchema = z
  .array(z.string().min(1))
  .min(1, { message: "Select at least one category" });

export const adminCreateVolunteerSchema = z.object({
  first_name: requiredString("First name"),
  last_name: requiredString("Last name"),
  email: z.string().email({ message: "Invalid email address" }),
  phone: optionalString,
  categories: categoriesSchema,
  service_area: requiredString("Service area"),
  home_address: optionalString,
  home_lat: optionalCoercedNumber,
  home_lng: optionalCoercedNumber,
});

export const updateVolunteerSchema = z.object({
  first_name: requiredString("First name"),
  last_name: requiredString("Last name"),
  phone: optionalString,
  categories: categoriesSchema,
  service_area: requiredString("Service area"),
  home_address: optionalString,
  home_lat: optionalCoercedNumber,
  home_lng: optionalCoercedNumber,
});

export const completeProfileSchema = z.object({
  first_name: requiredString("First name"),
  last_name: requiredString("Last name"),
  phone: optionalString,
  categories: categoriesSchema,
  service_area: requiredString("Service area"),
  home_address: optionalString,
  home_lat: optionalCoercedNumber,
  home_lng: optionalCoercedNumber,
});

export type AdminCreateVolunteerInput = z.infer<typeof adminCreateVolunteerSchema>;
export type UpdateVolunteerInput = z.infer<typeof updateVolunteerSchema>;
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;
