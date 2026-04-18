import { execSync } from "node:child_process";

export async function setup() {
  try {
    execSync("npx supabase status", { stdio: "ignore" });
  } catch {
    throw new Error(
      "Local Supabase not running. Run `npm run supabase:start` before integration tests.",
    );
  }
  execSync("npx supabase db reset --yes", { stdio: "inherit" });
}

export async function teardown() {
  // no-op
}
