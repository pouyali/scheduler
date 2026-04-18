import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/auth/roles";

export default async function HomePage() {
  const role = await getUserRole();
  switch (role.role) {
    case "guest":
      redirect("/login");
    case "admin":
      redirect("/admin");
    case "volunteer":
      redirect("/volunteer/dashboard");
    case "incomplete":
      redirect("/signup/complete-profile");
  }
}
