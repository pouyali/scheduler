import { z } from "zod";

const nameSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length > 0, { message: "Name is required" })
  .refine((v) => v.length <= 80, { message: "Name must be 80 characters or fewer" });

export const createCategorySchema = z.object({
  name: nameSchema,
});

export const updateCategorySchema = z.object({
  name: nameSchema,
  description: z
    .string()
    .transform((v) => (v.trim() === "" ? undefined : v.trim()))
    .optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
