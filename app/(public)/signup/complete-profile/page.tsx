"use client";

import { useActionState } from "react";
import { completeProfileAction, type CompleteProfileState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CompleteProfilePage() {
  const [state, formAction, pending] = useActionState<CompleteProfileState, FormData>(
    completeProfileAction,
    undefined,
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete your volunteer profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" name="first_name" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="last_name">Last name</Label>
                <Input id="last_name" name="last_name" required />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="service_area">Service area (city)</Label>
              <Input id="service_area" name="service_area" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="categories">Categories (comma-separated)</Label>
              <Input
                id="categories"
                name="categories"
                placeholder="transportation, companionship"
              />
            </div>
            {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving..." : "Save and continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
