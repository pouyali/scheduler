"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createCategoryAction,
  updateCategoryAction,
  archiveCategoryAction,
  unarchiveCategoryAction,
  type CategoryFormState,
} from "./actions";

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  archived_at: string | null;
};

export function CategoriesManager({ rows }: { rows: CategoryRow[] }) {
  const [state, formAction, pending] = useActionState<CategoryFormState, FormData>(
    createCategoryAction,
    undefined,
  );

  return (
    <div className="space-y-6">
      <form action={formAction} className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-cat-name">Add a category</Label>
          <Input id="new-cat-name" name="name" placeholder="e.g. Pet care" required />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add"}
        </Button>
      </form>
      {state?.error ? (
        <p className="text-sm italic text-muted-foreground">{state.error}</p>
      ) : null}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2">Name</th>
            <th>Slug</th>
            <th>Description</th>
            <th>Status</th>
            <th className="w-[220px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <CategoryRowView key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryRowView({ row }: { row: CategoryRow }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const archived = row.archived_at !== null;

  if (editing) {
    return (
      <tr className="hover:bg-muted">
        <td colSpan={5} className="py-2">
          <form
            action={async (fd) => {
              await updateCategoryAction(row.id, fd);
              setEditing(false);
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`name-${row.id}`}>Name</Label>
              <Input id={`name-${row.id}`} name="name" defaultValue={row.name} required />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`desc-${row.id}`}>Description</Label>
              <Input
                id={`desc-${row.id}`}
                name="description"
                defaultValue={row.description ?? ""}
              />
            </div>
            <Button type="submit">Save</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={archived ? "italic text-muted-foreground" : "hover:bg-muted"}>
      <td className="py-2">{row.name}</td>
      <td className="text-xs text-muted-foreground">{row.slug}</td>
      <td className="text-xs">{row.description ?? ""}</td>
      <td>
        {archived ? (
          <StatusBadge variant="archived">Archived</StatusBadge>
        ) : (
          <StatusBadge variant="active">Active</StatusBadge>
        )}
      </td>
      <td className="space-x-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={isPending}>
          Edit
        </Button>
        {archived ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => unarchiveCategoryAction(row.id))}
          >
            Unarchive
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => archiveCategoryAction(row.id))}
          >
            Archive
          </Button>
        )}
      </td>
    </tr>
  );
}
