import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { CompleteProfileForm } from "./complete-profile-form";

export default async function CompleteProfilePage() {
  const role = await getUserRole();
  if (role.role === "guest") redirect("/login");
  if (role.role === "admin") redirect("/admin");
  if (role.role === "volunteer") redirect("/volunteer/dashboard");

  const supabase = await createSupabaseServerClient();
  const categories = await listCategories(supabase);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <h1 className="text-h2 mb-2 text-foreground">Complete your volunteer profile</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          We use these to match you with seniors who need help in your area.
        </p>
        <CompleteProfileForm
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        />
      </div>
    </div>
  );
}
