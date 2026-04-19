import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/seniors" className="text-sm underline">
          ← Back to seniors
        </Link>
        <h2 className="mt-2 text-h2">Import seniors from CSV</h2>
      </div>
      <ImportWizard />
    </div>
  );
}
