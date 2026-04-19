import Link from "next/link";

export default function AcceptedPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">You&apos;ve got it!</h1>
      <p className="mt-4 text-muted-foreground">
        Thanks for accepting. We&apos;ll send you the full details by email and they&apos;re also in your dashboard.
      </p>
      <Link href="/volunteer/dashboard" className="mt-6 inline-block underline underline-offset-2">
        Open your dashboard
      </Link>
    </main>
  );
}
