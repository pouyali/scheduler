import { DevTools } from "./dev-tools";

export default function AdminDashboardPage() {
  const showDevTools =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
  return (
    <div>
      <h2 className="text-h2">Dashboard</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Phase 1 feature sub-projects will fill this in.
      </p>
      {showDevTools ? <DevTools /> : null}
    </div>
  );
}
