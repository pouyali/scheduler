"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Database } from "@/lib/db/types";
import { cancelRequestAction, reopenRequestAction, markCompletedAction, reassignRequestAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

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
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/admin/requests/${id}/edit`}>Edit</Link>
      </Button>

      {status === "accepted" && (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => startTransition(() => reopenRequestAction(id))}>Reopen</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowReassign(true)}>Reassign</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => startTransition(() => markCompletedAction(id))}>Mark completed</Button>
        </>
      )}

      {status !== "cancelled" && status !== "completed" && (
        <Button type="button" variant="outline" size="sm" className="border-red-500 text-red-600 hover:bg-red-50" onClick={() => setShowCancel(true)}>Cancel</Button>
      )}

      <CancelDialog id={id} open={showCancel} onClose={() => setShowCancel(false)} />
      <ReassignDialog id={id} choices={eligibleForReassign} open={showReassign} onClose={() => setShowReassign(false)} />

      {pending && <span className="text-sm text-muted-foreground">Working…</span>}
    </div>
  );
}

function CancelDialog({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <form
          action={(fd) => startTransition(async () => {
            await cancelRequestAction({
              id,
              reason: (fd.get("reason") as string) || undefined,
              notifyRecipients: fd.get("notify") === "on",
            });
            onClose();
          })}
          className="space-y-4"
        >
          <DialogTitle>Cancel request</DialogTitle>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea id="cancel-reason" name="reason" rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <input id="cancel-notify" type="checkbox" name="notify" />
            <Label htmlFor="cancel-notify">Notify recipients</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Back</Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              className="border-red-500 bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Cancelling…" : "Cancel request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  id, choices, open, onClose,
}: { id: string; choices: { id: string; label: string }[]; open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [pick, setPick] = useState(choices[0]?.id ?? "");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <div className="space-y-4">
          <DialogTitle>Reassign to</DialogTitle>
          {choices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No eligible volunteers to reassign to.</p>
          ) : (
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="flex h-9 w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              {choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Back</Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || !pick}
              onClick={() => startTransition(async () => { await reassignRequestAction({ id, newVolunteerId: pick }); onClose(); })}
            >
              {pending ? "Reassigning…" : "Reassign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
