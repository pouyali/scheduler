"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRequest } from "@/lib/db/queries/service-requests";
import { combineDateTimeToIso } from "@/lib/service-requests/datetime";

const Schema = z
  .object({
    senior_id: z.string().uuid({ message: "Please pick a senior." }),
    category: z.string().min(1, "Category is required."),
    priority: z.enum(["low", "normal", "high"]),
    requested_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
      .optional(),
    requested_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Pick a valid time.")
      .optional(),
    requested_at: z.string().min(1).optional(),
    description: z.string().max(2000).optional().default(""),
  })
  .refine(
    (v) => v.requested_at || (v.requested_date && v.requested_time),
    { message: "Pick a date and time.", path: ["requested_date"] },
  );

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; formError?: string; fieldErrors: Record<string, string> };

export async function createRequestAction(
  formData: FormData | Record<string, unknown>,
): Promise<CreateResult> {
  const raw =
    formData instanceof FormData
      ? Object.fromEntries(formData.entries())
      : formData;

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;
  const requested_at =
    data.requested_at ??
    combineDateTimeToIso(data.requested_date!, data.requested_time!);

  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  try {
    const req = await _createRequestForAdmin(
      supabase,
      {
        senior_id: data.senior_id,
        category: data.category,
        priority: data.priority,
        requested_at,
        description: data.description,
      },
      admin.userId,
    );
    redirect(`/admin/requests/${req.id}`);
  } catch (e) {
    // next/navigation redirect throws a special error — re-throw it so Next handles it.
    if (
      e instanceof Error &&
      (e.message === "NEXT_REDIRECT" ||
        (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"))
    ) {
      throw e;
    }
    return { ok: false, fieldErrors: {}, formError: (e as Error).message };
  }
}

/** Exported for integration tests (avoids cookie/auth dependency). */
export async function _createRequestForAdmin(
  supabase: SupabaseClient<Database>,
  input: {
    senior_id: string;
    category: string;
    priority: "low" | "normal" | "high";
    requested_at: string;
    description?: string;
  },
  adminId: string,
) {
  return createServiceRequest(supabase, {
    senior_id: input.senior_id,
    category: input.category,
    priority: input.priority,
    requested_at: input.requested_at,
    description: input.description || null,
    created_by: adminId,
  });
}
