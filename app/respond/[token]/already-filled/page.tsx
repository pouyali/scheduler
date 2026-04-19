import Link from "next/link";

export default function AlreadyFilledPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">This request has already been filled</h1>
      <p className="mt-4 text-muted-foreground">
        Someone else jumped on it first — thanks for being available.
      </p>
      <Link href="/volunteer/dashboard" className="mt-6 inline-block underline underline-offset-2">
        Open your dashboard
      </Link>
    </main>
  );
}
