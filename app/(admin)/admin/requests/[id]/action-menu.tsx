"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Database } from "@/lib/db/types";
import { cancelRequestAction, reopenRequestAction, markCompletedAction, reassignRequestAction } from "./actions";

type Status = Database["public"]["Enums"]["request_status"];

type Props = {
  id: string;
  status: Status;
  eligibleForReassign?: { id: string; label: string }[];
};

export function ActionMenu({ id, status, eligibleForReassign = [] }: Props) {
  const [pending, startTransition] = useTransition();
  const [showCancel, setShowCancel] = useState(false);
  const [showReassign, setShowReassign] = useState(false);

  return (
    <div className="flex gap-2">
      <Link href={`/admin/requests/${id}/edit`} className="rounded border px-3 py-1 text-sm">Edit</Link>

      {status === "accepted" && (
        <>
          <button type="button" onClick={() => startTransition(() => reopenRequestAction(id))} className="rounded border px-3 py-1 text-sm">Reopen</button>
          <button type="button" onClick={() => setShowReassign(true)} className="rounded border px-3 py-1 text-sm">Reassign</button>
          <button type="button" onClick={() => startTransition(() => markCompletedAction(id))} className="rounded border px-3 py-1 text-sm">Mark completed</button>
        </>
      )}

      {status !== "cancelled" && status !== "completed" && (
        <button type="button" onClick={() => setShowCancel(true)} className="rounded border border-red-500 px-3 py-1 text-sm text-red-600">Cancel</button>
      )}

      {showCancel && (
        <CancelDialog id={id} onClose={() => setShowCancel(false)} />
      )}

      {showReassign && (
        <ReassignDialog id={id} choices={eligibleForReassign} onClose={() => setShowReassign(false)} />
      )}
      {pending && <span className="text-sm text-gray-500">Working…</span>}
    </div>
  );
}

function CancelDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        action={(fd) => startTransition(async () => {
          await cancelRequestAction({
            id,
            reason: (fd.get("reason") as string) || undefined,
            notifyRecipients: fd.get("notify") === "on",
          });
          onClose();
        })}
        className="w-80 space-y-3 rounded bg-white p-4"
      >
        <h3 className="font-semibold">Cancel request</h3>
        <label className="block text-sm">Reason (optional)
          <textarea name="reason" rows={3} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="block text-sm"><input type="checkbox" name="notify" className="mr-2" />Notify recipients</label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">Back</button>
          <button disabled={pending} className="rounded bg-red-600 px-3 py-1 text-sm text-white">
            {pending ? "Cancelling…" : "Cancel request"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReassignDialog({
  id, choices, onClose,
}: { id: string; choices: { id: string; label: string }[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [pick, setPick] = useState(choices[0]?.id ?? "");

  return (
    <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 space-y-3 rounded bg-white p-4">
        <h3 className="font-semibold">Reassign to</h3>
        {choices.length === 0 ? (
          <p className="text-sm text-gray-500">No eligible volunteers to reassign to.</p>
        ) : (
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="w-full rounded border px-2 py-1">
            {choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">Back</button>
          <button
            disabled={pending || !pick}
            onClick={() => startTransition(async () => { await reassignRequestAction({ id, newVolunteerId: pick }); onClose(); })}
            className="rounded bg-black px-3 py-1 text-sm text-white"
          >{pending ? "Reassigning…" : "Reassign"}</button>
        </div>
      </div>
    </div>
  );
}
