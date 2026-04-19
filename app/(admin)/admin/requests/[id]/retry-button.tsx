"use client";
import { useTransition } from "react";
import { retryNotificationAction } from "./actions";

export function RetryButton({ notificationId }: { notificationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => retryNotificationAction(notificationId))}
      className="text-blue-600 underline text-sm"
    >
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}
