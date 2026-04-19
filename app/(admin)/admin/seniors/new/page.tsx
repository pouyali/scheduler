import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { SeniorForm } from "./senior-form";

export default async function NewSeniorPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/seniors" className="text-sm underline">
          ← Back to seniors
        </Link>
        <h2 className="mt-2 text-h2">New senior</h2>
      </div>
      <SeniorForm />
    </div>
  );
}
