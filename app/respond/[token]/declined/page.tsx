import Link from "next/link";

export default function DeclinedPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">Thanks for letting us know</h1>
      <p className="mt-4 text-muted-foreground">
        We&apos;ll look for someone else. We appreciate you responding.
      </p>
      <Link href="/volunteer/dashboard" className="mt-6 inline-block underline underline-offset-2">
        Open your dashboard
      </Link>
    </main>
  );
}
