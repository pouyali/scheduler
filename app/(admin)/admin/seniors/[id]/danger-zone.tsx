"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  archiveSenior,
  unarchiveSenior,
  permanentlyDeleteSenior,
} from "../actions";

type Props = {
  id: string;
  fullName: string;
  archived: boolean;
};

export function DangerZone({ id, fullName, archived }: Props) {
  const [isPending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-10 rounded-md border border-red-200 p-4">
      <h3 className="text-sm font-semibold text-red-700">Danger zone</h3>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {archived ? (
          <>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => startTransition(() => unarchiveSenior(id))}
            >
              Unarchive
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">Permanently delete</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Permanently delete {fullName}?</DialogTitle>
                <DialogDescription>
                  This removes the senior and ALL their service requests and notifications.
                  Type <strong>{fullName}</strong> to confirm.
                </DialogDescription>
                <Input
                  className="mt-3"
                  placeholder={fullName}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
                {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    disabled={isPending || typed !== fullName}
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        try {
                          await permanentlyDeleteSenior(id, typed);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Failed");
                        }
                      })
                    }
                  >
                    Delete forever
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => archiveSenior(id))}
          >
            Archive
          </Button>
        )}
      </div>
    </div>
  );
}
