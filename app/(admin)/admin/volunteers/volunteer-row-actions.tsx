"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  approveVolunteerAction,
  rejectVolunteerAction,
  reactivateVolunteerAction,
} from "./actions";

type Status = "pending" | "active" | "inactive";

export function VolunteerRowActions({ id, status }: { id: string; status: Status }) {
  const [isPending, startTransition] = useTransition();

  if (status === "pending") {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => approveVolunteerAction(id))}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(() => rejectVolunteerAction(id))}
        >
          Reject
        </Button>
      </div>
    );
  }
  if (status === "inactive") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => reactivateVolunteerAction(id))}
      >
        Reactivate
      </Button>
    );
  }
  return null;
}
