"use client";
import { useTransition } from "react";
import { retryNotificationAction } from "./actions";
import { Button } from "@/components/ui/button";

export function RetryButton({ notificationId }: { notificationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => retryNotificationAction(notificationId))}
    >
      {pending ? "Retrying…" : "Retry"}
    </Button>
  );
}
