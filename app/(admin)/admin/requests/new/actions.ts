"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRequest } from "@/lib/db/queries/service-requests";

const Schema = z.object({
  senior_id: z.string().uuid({ message: "Please pick a senior." }),
  category: z.string().min(1, "Category is required."),
  priority: z.enum(["low", "normal", "high"]),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date."),
  description: z.string().max(2000).optional().default(""),
});

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

  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  try {
    const req = await _createRequestForAdmin(supabase, parsed.data, admin.userId);
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
  input: z.infer<typeof Schema>,
  adminId: string,
) {
  return createServiceRequest(supabase, {
    senior_id: input.senior_id,
    category: input.category,
    priority: input.priority,
    requested_date: input.requested_date,
    description: input.description || null,
    created_by: adminId,
  });
}
