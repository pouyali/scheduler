import Link from "next/link";

export default function AcceptedPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">You've got it!</h1>
      <p className="mt-4 text-gray-600">
        Thanks for accepting. We'll send you the full details by email and they're also in your dashboard.
      </p>
      <Link href="/volunteer/dashboard" className="mt-6 inline-block text-blue-600 underline">
        Open your dashboard
      </Link>
    </main>
  );
}
