import Link from "next/link";

export default function InvalidPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">This link is no longer valid</h1>
      <p className="mt-4 text-gray-600">
        It may have expired or already been used. Please check your email for a newer invite, or sign in for the latest list.
      </p>
      <Link href="/login" className="mt-6 inline-block text-blue-600 underline">
        Sign in
      </Link>
    </main>
  );
}
