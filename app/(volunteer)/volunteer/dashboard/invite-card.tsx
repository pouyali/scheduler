"use client";

import { useTransition } from "react";
import { respondFromPortal } from "../actions";

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
    <article className="rounded border p-4 space-y-2">
      <header className="flex items-center justify-between">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase">{invite.category}</span>
        <time className="text-sm text-gray-600">{invite.requestedDate}</time>
      </header>
      <p><strong>{invite.seniorFirstName}</strong> · {invite.seniorCity}</p>
      <p className="text-sm text-gray-700">{invite.descriptionExcerpt}</p>
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => startTransition(async () => { await respondFromPortal({ requestId: invite.requestId, action: "accept" }); })}
          className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50"
        >{pending ? "…" : "Accept"}</button>
        <button
          disabled={pending}
          onClick={() => startTransition(async () => { await respondFromPortal({ requestId: invite.requestId, action: "decline" }); })}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >{pending ? "…" : "Decline"}</button>
      </div>
    </article>
  );
}
