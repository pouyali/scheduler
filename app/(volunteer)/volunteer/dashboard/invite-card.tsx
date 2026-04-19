"use client";

import { useTransition } from "react";
import { respondFromPortal } from "../actions";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

type Invite = {
  requestId: string;
  category: string;
  requestedDate: string;
  seniorFirstName: string;
  seniorCity: string;
  descriptionExcerpt: string;
};

export function InviteCard({ invite }: { invite: Invite }) {
  const [pending, startTransition] = useTransition();
  return (
    <article className="rounded-[var(--radius-lg)] border border-border p-4 space-y-2">
      <header className="flex items-center justify-between">
        <StatusBadge variant="open">{invite.category}</StatusBadge>
        <time className="text-sm text-muted-foreground">{invite.requestedDate}</time>
      </header>
      <p className="text-sm"><strong>{invite.seniorFirstName}</strong> · {invite.seniorCity}</p>
      <p className="text-sm text-muted-foreground">{invite.descriptionExcerpt}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => startTransition(async () => { await respondFromPortal({ requestId: invite.requestId, action: "accept" }); })}
        >{pending ? "…" : "Accept"}</Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => { await respondFromPortal({ requestId: invite.requestId, action: "decline" }); })}
        >{pending ? "…" : "Decline"}</Button>
      </div>
    </article>
  );
}
